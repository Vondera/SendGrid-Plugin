// Setup type definitions for built-in Supabase Runtime APIs
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Supabase Edge Function for Vondera SendGrid Plugin

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface VonderaClientConfig {
  clientId: string;
  clientSecret: string;
  appId: string;
  locale?: string;
  timezone?: string;
}

// Initialize Vondera Client (simplified - adjust based on actual SDK)
class VonderaClient {
  private config: VonderaClientConfig;
  private accessToken?: string;

  constructor(config: VonderaClientConfig) {
    this.config = config;
  }

  setAccessToken(token: string) {
    this.accessToken = token;
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Initialize Vondera Client
    const vonderaClient = new VonderaClient({
      clientId: Deno.env.get("VONDERA_CLIENT_ID") ?? "",
      clientSecret: Deno.env.get("VONDERA_CLIENT_SECRET") ?? "",
      appId: Deno.env.get("VONDERA_APP_ID") ?? "",
      locale: Deno.env.get("VONDERA_LOCALE") || "en",
      timezone: Deno.env.get("VONDERA_TIMEZONE") || "Africa/Cairo",
    });

    // Parse URL and method
    const url = new URL(req.url);
    const fullPath = url.pathname;
    const method = req.method;

    // Extract path after function name
    // Supabase passes full path like /functions/v1/vondera-sendgrid/webhook/install
    const functionPath = "/functions/v1/vondera-sendgrid";
    let path = fullPath;
    
    if (fullPath.startsWith(functionPath)) {
      path = fullPath.slice(functionPath.length) || "/";
    }
    
    // Debug logging
    console.log("Request path:", { fullPath, extractedPath: path, method });

    // Route handling
    if (method === "GET" && (path === "/health" || path === "/" || fullPath.endsWith("/health"))) {
      return new Response(
        JSON.stringify({
          status: "ok",
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Parse request body for POST requests
    let body: any = null;
    if (method === "POST") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    // Webhook routes - check both extracted path and full path
    if (method === "POST" && (path === "/webhook/install" || fullPath.includes("/webhook/install"))) {
      return await handleInstall(supabase, vonderaClient, body);
    }

    if (method === "POST" && (path === "/webhook/uninstall" || fullPath.includes("/webhook/uninstall"))) {
      return await handleUninstall(supabase, vonderaClient, body);
    }

    if (method === "POST" && (path === "/webhook/settings" || fullPath.includes("/webhook/settings"))) {
      return await handleSettings(supabase, vonderaClient, body);
    }

    // API routes
    if (method === "GET" && (path.startsWith("/api/settings/") || fullPath.includes("/api/settings/"))) {
      const storeId = (path.split("/api/settings/")[1] || fullPath.split("/api/settings/")[1])?.split("/")[0];
      return await getSettings(supabase, storeId);
    }

    // 404 Not Found
    return new Response(
      JSON.stringify({ error: "Not Found" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      }
    );
  } catch (error) {
    console.error("Function error:", error);
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

// Handler: Install webhook
async function handleInstall(supabase: any, vonderaClient: VonderaClient, payload: any) {
  try {
    const store_id = payload.store_id || payload.storeId;
    const access_token = payload.access_token || payload.accessToken;
    const refresh_token = payload.refresh_token || payload.refreshToken;
    const installation_id = payload.installation_id || payload.installationId;
    const app_id = payload.app_id || payload.appId;
    const scopes = payload.scopes || [];
    const expires_at = payload.expires_at || payload.expiresAt;

    if (!store_id || !access_token || !refresh_token) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: store_id, access_token, refresh_token",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Store tokens in Supabase
    const { data: tokenData, error: tokenError } = await supabase
      .from("user_tokens")
      .upsert({
        store_id: store_id,
        access_token: access_token,
        refresh_token: refresh_token,
        installation_id: installation_id,
        app_id: app_id,
        scopes: scopes,
        expires_at: expires_at,
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "store_id",
      })
      .select()
      .single();

    if (tokenError) {
      console.error("Error storing tokens:", tokenError);
      // Check if it's a table not found error
      const isTableNotFound = tokenError.message?.includes("relation") && tokenError.message?.includes("does not exist");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to store tokens",
          details: tokenError.message,
          hint: isTableNotFound 
            ? "Database tables may not exist. Please run database/schema.sql in Supabase SQL Editor."
            : undefined,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // Extract and save settings if provided in the payload
    // Settings come from setup_data directly (e.g., setup_data.sendgrid_api_key)
    const setupData = payload.setup_data || {};
    
    if (Object.keys(setupData).length > 0) {
      const sendgridApiKey = setupData.sendgrid_api_key || setupData.sendgridApiKey;
      const sendgridFromEmail = setupData.sendgrid_from_email || setupData.sendgridFromEmail;
      const notificationEmail = setupData.notification_email || setupData.notificationEmail;
      const emailTemplate = setupData.email_template || setupData.emailTemplate || setupData.sendgrid_template_id || setupData.sendgridTemplateId;
      const isEnabled = setupData.enabled !== undefined ? setupData.enabled : true;

      const settingsData: any = {
        store_id: store_id,
        sendgrid_api_key: sendgridApiKey,
        sendgrid_from_email: sendgridFromEmail,
        notification_email: notificationEmail,
        email_template: emailTemplate,
        enabled: isEnabled,
        updated_at: new Date().toISOString(),
      };

      // Remove undefined fields
      Object.keys(settingsData).forEach((key) => {
        if (settingsData[key] === undefined) {
          delete settingsData[key];
        }
      });

      // Only save if there's actual data to save
      if (Object.keys(settingsData).length > 1) { // More than just store_id
        const { error: settingsError } = await supabase
          .from("user_settings")
          .upsert(settingsData, {
            onConflict: "store_id",
          });

        if (settingsError) {
          console.error("Error storing settings:", settingsError);
          // Don't fail the install if settings fail, just log it
        } else {
          console.log(`✅ Settings saved for store: ${store_id}`);
        }
      }
    }

    vonderaClient.setAccessToken(access_token);
    console.log(`✅ Plugin installed for store: ${store_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Tokens stored successfully",
        store_id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Install handler error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        details: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
}

// Handler: Uninstall webhook
async function handleUninstall(supabase: any, vonderaClient: VonderaClient, payload: any) {
  try {
    const store_id = payload.store_id || payload.storeId;

    if (!store_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required field: store_id",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Delete user tokens
    const { error: tokenError } = await supabase
      .from("user_tokens")
      .delete()
      .eq("store_id", store_id);

    if (tokenError) {
      console.error("Error deleting tokens:", tokenError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to delete tokens",
          details: tokenError.message,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // Delete user settings
    const { error: settingsError } = await supabase
      .from("user_settings")
      .delete()
      .eq("store_id", store_id);

    if (settingsError) {
      console.error("Error deleting settings:", settingsError);
    }

    // Delete all orders for this store
    const { error: ordersError } = await supabase
      .from("orders")
      .delete()
      .eq("store_id", store_id);

    if (ordersError) {
      console.error("Error deleting orders:", ordersError);
      // Don't fail uninstall if orders deletion fails
    } else {
      console.log(`🗑️  Deleted all orders for store: ${store_id}`);
    }

    console.log(`🗑️  Plugin uninstalled for store: ${store_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "User metadata deleted successfully",
        store_id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Uninstall handler error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        details: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
}

// Handler: Settings webhook
async function handleSettings(supabase: any, vonderaClient: VonderaClient, payload: any) {
  try {
    const store_id = payload.storeId || payload.store_id;
    const settings = payload.settings || {};

    if (!store_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required field: storeId",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    const sendgridApiKey = settings.sendgrid_api_key;
    const sendgridFromEmail = settings.sendgrid_from_email;
    const emailTemplate = settings.email_template || settings.sendgrid_template_id || settings.sendgridTemplateId;
    const isEnabled = settings.enabled !== undefined ? settings.enabled : true;

    const settingsData: any = {
      store_id: store_id,
      sendgrid_api_key: sendgridApiKey,
      sendgrid_from_email: sendgridFromEmail,
      email_template: emailTemplate,
      enabled: isEnabled,
      updated_at: new Date().toISOString(),
    };

    // Remove undefined fields
    Object.keys(settingsData).forEach((key) => {
      if (settingsData[key] === undefined) {
        delete settingsData[key];
      }
    });

    const { data, error } = await supabase
      .from("user_settings")
      .upsert(settingsData, {
        onConflict: "store_id",
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving settings:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to save settings",
          details: error.message,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    console.log(`⚙️  Settings updated for store: ${store_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Settings saved successfully",
        store_id,
        settings: data,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Settings handler error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        details: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
}

// Handler: Get settings by storeId
async function getSettings(supabase: any, storeId: string) {
  try {
    if (!storeId) {
      return new Response(
        JSON.stringify({ error: "Missing storeId parameter" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("store_id", storeId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return new Response(
          JSON.stringify({ error: "Settings not found for this store" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          }
        );
      }
      throw error;
    }

    return new Response(
      JSON.stringify({
        success: true,
        storeId,
        settings: data,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error fetching settings:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
}

