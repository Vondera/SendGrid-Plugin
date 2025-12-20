// Setup type definitions for built-in Supabase Runtime APIs
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Supabase Edge Function for sending order emails
// This function is triggered by a database webhook when a new order is inserted

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  console.log("📧 [Send Order Email] Function invoked");
  console.log("📧 [Send Order Email] Method:", req.method);
  console.log("📧 [Send Order Email] URL:", req.url);

  if (req.method === "OPTIONS") {
    console.log("📧 [Send Order Email] CORS preflight request");
    return new Response("ok", { headers: corsHeaders });
  }

  let vonderaOrderId = "";
  let storeId = "";
  let supabase: any = null;
  
  try {
    console.log("📧 [Send Order Email] Initializing Supabase client");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get order data from webhook payload
    console.log("📧 [Send Order Email] Parsing request body");
    const payload = await req.json();
    console.log("📧 [Send Order Email] Raw payload received:", JSON.stringify(payload).substring(0, 500));

    // Handle different webhook payload structures
    // Vondera webhook: { trigger, storeId, body: { order data } }
    // Database webhook: { record: { order data } }
    const order = payload.body || payload.record || payload;
    storeId = payload.storeId || order.storeId || order.store_id;
    vonderaOrderId = order.id?.toString() || order.order_number?.toString() || "";

    // Save order to database first (with pending email status)
    console.log(`📧 [Send Order Email] Saving order to database: ${vonderaOrderId}`);
    const orderData = {
      vondera_order_id: vonderaOrderId,
      store_id: storeId,
      order_number: order.id?.toString() || order.order_number || vonderaOrderId,
      customer_email: order.customer?.email || order.customer_email || null,
      customer_name: order.customer?.name || null,
      customer_phone: order.customer?.phone || null,
      total: order.payment?.totalPrice || order.total || order.totalCost || 0,
      currency: order.payment?.currency || "EGP",
      order_status: order.status || "Pending",
      email_status: "pending",
      order_data: order, // Store full order data as JSONB
    };

    const { data: savedOrder, error: saveOrderError } = await supabase
      .from("orders")
      .upsert(orderData, {
        onConflict: "vondera_order_id",
      })
      .select()
      .single();

    if (saveOrderError) {
      console.error(`📧 [Send Order Email] ⚠️  Error saving order to database:`, saveOrderError);
      // Continue with email sending even if DB save fails
    } else {
      console.log(`📧 [Send Order Email] ✅ Order saved to database: ${vonderaOrderId}`);
    }

    console.log("📧 [Send Order Email] Order data extracted:", {
      order_id: order?.id,
      store_id: storeId,
      order_number: order?.id, // Using id as order number
      customer_email: order?.customer?.email,
      total: order?.payment?.totalPrice || order?.total,
      trigger: payload.trigger,
    });

    if (!order || !storeId) {
      console.error("📧 [Send Order Email] ❌ Invalid order data:", { 
        order: order ? "exists" : "missing",
        storeId: storeId || "missing",
        payload_keys: Object.keys(payload),
      });
      return new Response(
        JSON.stringify({ error: "Invalid order data: missing order or storeId" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Get user settings for this store
    console.log(`📧 [Send Order Email] Fetching settings for store: ${storeId}`);
    const { data: settings, error: settingsError } = await supabase
      .from("user_settings")
      .select("*")
      .eq("store_id", storeId)
      .single();

    if (settingsError || !settings) {
      console.warn(`📧 [Send Order Email] ⚠️  No settings found for store: ${storeId}`, {
        error: settingsError?.message,
      });
      return new Response(
        JSON.stringify({ message: "Settings not found, skipping email" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`📧 [Send Order Email] Settings retrieved for store: ${storeId}`, {
      enabled: settings.enabled,
      has_sendgrid_key: !!settings.sendgrid_api_key,
      has_from_email: !!settings.sendgrid_from_email,
    });

    if (!settings.enabled) {
      console.log(`📧 [Send Order Email] ⏸️  Email notifications disabled for store: ${storeId}`);
      return new Response(
        JSON.stringify({ message: "Email notifications disabled" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    if (!settings.sendgrid_api_key) {
      console.warn(`📧 [Send Order Email] ⚠️  No SendGrid API key configured for store: ${storeId}`);
      return new Response(
        JSON.stringify({ message: "SendGrid API key not configured" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Send email using SendGrid
    console.log(`📧 [Send Order Email] Preparing email for order: ${order.id}`);
    const sendgridApiKey = settings.sendgrid_api_key;
    
    // Get from email - validate it's not empty
    let fromEmail = settings.sendgrid_from_email || Deno.env.get("SENDGRID_FROM_EMAIL") || "";
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!fromEmail || !emailRegex.test(fromEmail)) {
      console.error(`📧 [Send Order Email] ❌ Invalid or missing from email address:`, {
        from_email: fromEmail,
        settings_from_email: settings.sendgrid_from_email,
        env_from_email: Deno.env.get("SENDGRID_FROM_EMAIL"),
      });
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Invalid or missing 'from' email address. Please configure sendgrid_from_email in settings.",
          hint: "The from email must be a valid email address and verified in your SendGrid account."
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }
    
    // Extract customer email from nested customer object or direct field
    const toEmail = order.customer?.email || order.customer_email || settings.notification_email;

    console.log(`📧 [Send Order Email] Email configuration:`, {
      from: fromEmail,
      to: toEmail,
      has_custom_template: !!settings.email_template,
      from_email_source: settings.sendgrid_from_email ? "settings" : Deno.env.get("SENDGRID_FROM_EMAIL") ? "environment" : "none",
    });

    if (!toEmail) {
      console.warn(`📧 [Send Order Email] ⚠️  No recipient email for order: ${order.id}`, {
        order_customer_email: order.customer?.email || order.customer_email,
        settings_notification_email: settings.notification_email,
      });
      return new Response(
        JSON.stringify({ message: "No recipient email" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Prepare email content
    const orderNumber = order.id || order.order_number || "N/A";
    const subject = `New Order #${orderNumber}`;
    
    // Check if email_template is a SendGrid Template ID (starts with d-) or custom HTML
    const emailTemplate = settings.email_template;
    const isSendGridTemplateId = emailTemplate && emailTemplate.trim().startsWith('d-');
    
    // Prepare email payload
    let emailPayload: any = {
      personalizations: [{
        to: [{ email: toEmail }],
        subject: subject,
      }],
      from: { email: fromEmail },
    };

    // Option 1: Use SendGrid Dynamic Template (if email_template starts with d-)
    if (isSendGridTemplateId) {
      const templateId = emailTemplate.trim();
      console.log(`📧 [Send Order Email] Using SendGrid Dynamic Template: ${templateId}`);
      
      // Prepare dynamic template data
      const templateData = prepareTemplateData(order, storeId);
      
      emailPayload.template_id = templateId;
      emailPayload.personalizations[0].dynamic_template_data = templateData;
      
      console.log(`📧 [Send Order Email] Template data prepared:`, {
        template_id: templateId,
        data_keys: Object.keys(templateData),
      });
    }
    // Option 2: Use custom HTML template with placeholders
    else if (emailTemplate) {
      console.log(`📧 [Send Order Email] Using custom HTML template`);
      let processedTemplate = replaceTemplatePlaceholders(emailTemplate, order, storeId);
      
      emailPayload.content = [
        {
          type: "text/html",
          value: processedTemplate,
        },
      ];
      
      console.log(`📧 [Send Order Email] Email prepared:`, {
        subject,
        template_length: processedTemplate.length,
        order_id: order.id,
      });
    }
    // Option 3: Use default template
    else {
      console.log(`📧 [Send Order Email] Using default template`);
      const defaultTemplate = getDefaultEmailTemplate(order, storeId);
      
      emailPayload.content = [
        {
          type: "text/html",
          value: defaultTemplate,
        },
      ];
      
      console.log(`📧 [Send Order Email] Email prepared:`, {
        subject,
        template_length: defaultTemplate.length,
        order_id: order.id,
      });
    }

    // Send email via SendGrid API
    console.log(`📧 [Send Order Email] Sending email via SendGrid API...`);
    const sendgridRequestStart = Date.now();
    const sendgridResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${sendgridApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const sendgridRequestTime = Date.now() - sendgridRequestStart;
    console.log(`📧 [Send Order Email] SendGrid API response:`, {
      status: sendgridResponse.status,
      status_text: sendgridResponse.statusText,
      response_time_ms: sendgridRequestTime,
    });

    if (!sendgridResponse.ok) {
      const errorText = await sendgridResponse.text();
      let errorDetails;
      try {
        errorDetails = JSON.parse(errorText);
      } catch {
        errorDetails = { raw: errorText };
      }
      
      console.error(`📧 [Send Order Email] ❌ SendGrid API error:`, {
        status: sendgridResponse.status,
        status_text: sendgridResponse.statusText,
        error: errorDetails,
        order_id: order.id,
        store_id: storeId,
        from_email: fromEmail,
        to_email: toEmail,
      });
      
      // Provide helpful error message
      const errorMessage = errorDetails.errors?.[0]?.message || errorText;
      const errorField = errorDetails.errors?.[0]?.field;
      
      // Update order email status to 'failed'
      if (vonderaOrderId) {
        const { error: updateError } = await supabase
          .from("orders")
          .update({
            email_status: "failed",
            email_error: errorMessage,
          })
          .eq("vondera_order_id", vonderaOrderId);

        if (updateError) {
          console.error(`📧 [Send Order Email] ⚠️  Error updating email status:`, updateError);
        }
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: `SendGrid API error: ${errorMessage}`,
          field: errorField,
          details: errorDetails,
          hint: errorField === "from.email" 
            ? "The 'from' email address must be verified in your SendGrid account. Go to Settings > Sender Authentication in SendGrid dashboard."
            : "Check your SendGrid API key and email configuration.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: sendgridResponse.status,
        }
      );
    }

    console.log(`📧 [Send Order Email] ✅ Email sent successfully for order: ${order.id}`, {
      order_id: order.id,
      order_number: orderNumber,
      store_id: storeId,
      to: toEmail,
      from: fromEmail,
      subject,
      response_time_ms: sendgridRequestTime,
    });

    // Update order email status to 'sent'
    if (vonderaOrderId) {
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          email_status: "sent",
          email_sent_at: new Date().toISOString(),
          email_error: null,
        })
        .eq("vondera_order_id", vonderaOrderId);

      if (updateError) {
        console.error(`📧 [Send Order Email] ⚠️  Error updating email status:`, updateError);
      } else {
        console.log(`📧 [Send Order Email] ✅ Email status updated to 'sent' for order: ${vonderaOrderId}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email sent successfully",
        order_id: order.id,
        vondera_order_id: vonderaOrderId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error(`📧 [Send Order Email] ❌ Error sending order email:`, {
      error: error.message,
      stack: error.stack,
      name: error.name,
    });

    // Update order email status to 'failed' if we have the order ID and supabase client
    if (vonderaOrderId && supabase) {
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          email_status: "failed",
          email_error: error.message || "Internal server error",
        })
        .eq("vondera_order_id", vonderaOrderId);

      if (updateError) {
        console.error(`📧 [Send Order Email] ⚠️  Error updating email status:`, updateError);
      } else {
        console.log(`📧 [Send Order Email] ✅ Email status updated to 'failed' for order: ${vonderaOrderId}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

/**
 * Prepare template data for SendGrid Dynamic Templates
 * Returns a JSON object that can be used with dynamic_template_data
 */
function prepareTemplateData(order: any, storeId?: string): Record<string, any> {
  // Extract all order data
  const orderId = order.id || "N/A";
  const orderNumber = order.id || order.order_number || "N/A";
  const total = order.payment?.totalPrice || order.total || order.totalCost || 0;
  const currency = order.payment?.currency || "EGP";
  const customerEmail = order.customer?.email || order.customer_email || "N/A";
  const customerName = order.customer?.name || "N/A";
  const customerPhone = order.customer?.phone || "N/A";
  const customerAddress = order.customer?.address || "N/A";
  const status = order.status || "N/A";
  const marketplace = order.marketPlaceId || "N/A";
  const productsCount = order.productsCount || order.products?.length || 0;
  const notes = order.notes || "N/A";
  const pickupMethod = order.pickupMethod || "N/A";
  const country = order.country || "N/A";
  
  // Handle Firestore timestamp format
  let orderDate = "N/A";
  if (order.date) {
    if (order.date._seconds) {
      orderDate = new Date(order.date._seconds * 1000).toLocaleString();
    } else {
      orderDate = new Date(order.date).toLocaleString();
    }
  } else if (order.created_at) {
    orderDate = new Date(order.created_at).toLocaleString();
  }

  // Format products list
  const products = order.products || [];
  const productsList = products.map((p: any) => ({
    name: p.name || p.id || "N/A",
    quantity: p.quantity || 1,
    price: p.itemPrice || p.totalPrice || 0,
    total: (p.quantity || 1) * (p.itemPrice || p.totalPrice || 0),
  }));

  // Payment details
  const paymentMethod = order.payment?.method || order.payment?.gateway || "N/A";
  const paymentStatus = order.payment?.paymentStatus || "N/A";
  const shippingFees = order.payment?.shippingFees || 0;
  const discount = order.payment?.discount || 0;

  return {
    order_id: orderId.toString(),
    order_number: orderNumber.toString(),
    order_total: total.toString(),
    order_currency: currency,
    order_status: status,
    order_date: orderDate,
    order_notes: notes,
    order_pickup_method: pickupMethod,
    order_country: country,
    order_marketplace: marketplace,
    order_products_count: productsCount.toString(),
    order_products: productsList,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    customer_address: customerAddress,
    payment_method: paymentMethod,
    payment_status: paymentStatus,
    payment_shipping_fees: shippingFees.toString(),
    payment_discount: discount.toString(),
    store_id: storeId || "N/A",
  };
}

/**
 * Replace template placeholders with actual order data
 * Supports placeholders like {{order_id}}, {{customer_name}}, etc.
 * Used for custom HTML templates stored in database
 */
function replaceTemplatePlaceholders(template: string, order: any, storeId?: string): string {
  // Extract all order data
  const orderId = order.id || "N/A";
  const orderNumber = order.id || order.order_number || "N/A";
  const total = order.payment?.totalPrice || order.total || order.totalCost || 0;
  const currency = order.payment?.currency || "EGP";
  const customerEmail = order.customer?.email || order.customer_email || "N/A";
  const customerName = order.customer?.name || "N/A";
  const customerPhone = order.customer?.phone || "N/A";
  const customerAddress = order.customer?.address || "N/A";
  const status = order.status || "N/A";
  const marketplace = order.marketPlaceId || "N/A";
  const productsCount = order.productsCount || order.products?.length || 0;
  const notes = order.notes || "N/A";
  const pickupMethod = order.pickupMethod || "N/A";
  const country = order.country || "N/A";
  
  // Handle Firestore timestamp format
  let orderDate = "N/A";
  if (order.date) {
    if (order.date._seconds) {
      orderDate = new Date(order.date._seconds * 1000).toLocaleString();
    } else {
      orderDate = new Date(order.date).toLocaleString();
    }
  } else if (order.created_at) {
    orderDate = new Date(order.created_at).toLocaleString();
  }

  // Format products list
  let productsList = "N/A";
  if (order.products && Array.isArray(order.products) && order.products.length > 0) {
    productsList = order.products.map((p: any) => 
      `${p.name || p.id} (Qty: ${p.quantity || 1}, Price: ${p.itemPrice || p.totalPrice || 0} ${currency})`
    ).join("<br>");
  }

  // Payment details
  const paymentMethod = order.payment?.method || order.payment?.gateway || "N/A";
  const paymentStatus = order.payment?.paymentStatus || "N/A";
  const shippingFees = order.payment?.shippingFees || 0;
  const discount = order.payment?.discount || 0;

  // Create replacement map
  const replacements: Record<string, string> = {
    "{{order_id}}": orderId.toString(),
    "{{order_number}}": orderNumber.toString(),
    "{{order_total}}": total.toString(),
    "{{order_currency}}": currency,
    "{{order_status}}": status,
    "{{order_date}}": orderDate,
    "{{order_notes}}": notes,
    "{{order_pickup_method}}": pickupMethod,
    "{{order_country}}": country,
    "{{order_marketplace}}": marketplace,
    "{{order_products_count}}": productsCount.toString(),
    "{{order_products_list}}": productsList,
    "{{customer_name}}": customerName,
    "{{customer_email}}": customerEmail,
    "{{customer_phone}}": customerPhone,
    "{{customer_address}}": customerAddress,
    "{{payment_method}}": paymentMethod,
    "{{payment_status}}": paymentStatus,
    "{{payment_shipping_fees}}": shippingFees.toString(),
    "{{payment_discount}}": discount.toString(),
    "{{store_id}}": storeId || "N/A",
  };

  // Replace all placeholders (case-insensitive)
  let result = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    // Replace both {{placeholder}} and {{PLACEHOLDER}} (case-insensitive)
    const regex = new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "gi");
    result = result.replace(regex, value);
  }

  return result;
}

function getDefaultEmailTemplate(order: any, storeId?: string): string {
  // Extract order details from different payload structures
  const orderId = order.id || "N/A";
  const orderNumber = order.id || order.order_number || "N/A";
  const total = order.payment?.totalPrice || order.total || order.totalCost || 0;
  const currency = order.payment?.currency || "EGP";
  const customerEmail = order.customer?.email || order.customer_email || "N/A";
  const customerName = order.customer?.name || "N/A";
  const customerPhone = order.customer?.phone || "N/A";
  
  // Handle Firestore timestamp format
  let orderDate = "N/A";
  if (order.date) {
    if (order.date._seconds) {
      orderDate = new Date(order.date._seconds * 1000).toLocaleString();
    } else {
      orderDate = new Date(order.date).toLocaleString();
    }
  } else if (order.created_at) {
    orderDate = new Date(order.created_at).toLocaleString();
  }

  const status = order.status || "N/A";
  const marketplace = order.marketPlaceId || "N/A";
  const productsCount = order.productsCount || order.products?.length || 0;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .order-details { background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .detail-row { margin: 10px 0; }
        .detail-label { font-weight: bold; display: inline-block; width: 150px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New Order Received!</h1>
        </div>
        <div class="content">
          <p>You have received a new order:</p>
          <div class="order-details">
            <div class="detail-row">
              <span class="detail-label">Order ID:</span> ${orderId}
            </div>
            <div class="detail-row">
              <span class="detail-label">Order Number:</span> ${orderNumber}
            </div>
            <div class="detail-row">
              <span class="detail-label">Total:</span> ${total} ${currency}
            </div>
            <div class="detail-row">
              <span class="detail-label">Status:</span> ${status}
            </div>
            <div class="detail-row">
              <span class="detail-label">Marketplace:</span> ${marketplace}
            </div>
            <div class="detail-row">
              <span class="detail-label">Products Count:</span> ${productsCount}
            </div>
            <div class="detail-row">
              <span class="detail-label">Customer Name:</span> ${customerName}
            </div>
            <div class="detail-row">
              <span class="detail-label">Customer Email:</span> ${customerEmail}
            </div>
            <div class="detail-row">
              <span class="detail-label">Customer Phone:</span> ${customerPhone}
            </div>
            <div class="detail-row">
              <span class="detail-label">Date:</span> ${orderDate}
            </div>
          </div>
          <p>Please process this order as soon as possible.</p>
        </div>
        <div class="footer">
          <p>This is an automated email from Vondera SendGrid Plugin</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

