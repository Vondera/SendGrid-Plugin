# Email Template Guide

This guide explains how email templates work in the Vondera SendGrid plugin and how to create custom templates with dynamic data.

## How Templates Work

The plugin supports two types of email templates:

1. **Default Template**: Automatically generated if no custom template is provided
2. **Custom Template**: HTML template with placeholders that get replaced with order data

## Template Storage

Custom templates are stored in the `user_settings` table in the `email_template` field. You can set them:

- During plugin installation via `setup_data.email_template`
- Via the settings webhook: `POST /webhook/settings`
- Directly in the database: `UPDATE user_settings SET email_template = '...' WHERE store_id = '...'`

## Available Placeholders

When creating a custom template, you can use these placeholders which will be automatically replaced with order data:

### Order Information

- `{{order_id}}` - Order ID from Vondera
- `{{order_number}}` - Order number
- `{{order_total}}` - Order total amount
- `{{order_currency}}` - Currency code (e.g., EGP, USD)
- `{{order_status}}` - Order status (Pending, Completed, etc.)
- `{{order_date}}` - Order creation date (formatted)
- `{{order_notes}}` - Order notes
- `{{order_pickup_method}}` - Pickup method (SHIPPING, PICKUP, etc.)
- `{{order_country}}` - Country code
- `{{order_marketplace}}` - Marketplace ID (instagram, facebook, etc.)
- `{{order_products_count}}` - Number of products in order
- `{{order_products_list}}` - Formatted list of products with quantities and prices

### Customer Information

- `{{customer_name}}` - Customer name
- `{{customer_email}}` - Customer email
- `{{customer_phone}}` - Customer phone number
- `{{customer_address}}` - Customer address

### Payment Information

- `{{payment_method}}` - Payment method (COD, Credit Card, etc.)
- `{{payment_status}}` - Payment status (PENDING, PAID, etc.)
- `{{payment_shipping_fees}}` - Shipping fees
- `{{payment_discount}}` - Discount amount

### Store Information

- `{{store_id}}` - Store ID

## Example Custom Template

Here's an example of a custom HTML template with placeholders:

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .order-details { background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Order #{{order_number}}</h1>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>You have received a new order from <strong>{{customer_name}}</strong>.</p>
      
      <div class="order-details">
        <h2>Order Details</h2>
        <p><strong>Order ID:</strong> {{order_id}}</p>
        <p><strong>Order Number:</strong> {{order_number}}</p>
        <p><strong>Total:</strong> {{order_total}} {{order_currency}}</p>
        <p><strong>Status:</strong> {{order_status}}</p>
        <p><strong>Date:</strong> {{order_date}}</p>
        
        <h3>Customer Information</h3>
        <p><strong>Name:</strong> {{customer_name}}</p>
        <p><strong>Email:</strong> {{customer_email}}</p>
        <p><strong>Phone:</strong> {{customer_phone}}</p>
        <p><strong>Address:</strong> {{customer_address}}</p>
        
        <h3>Products</h3>
        <p>{{order_products_list}}</p>
        
        <h3>Payment</h3>
        <p><strong>Method:</strong> {{payment_method}}</p>
        <p><strong>Status:</strong> {{payment_status}}</p>
      </div>
      
      <p>Please process this order as soon as possible.</p>
    </div>
  </div>
</body>
</html>
```

## Setting a Custom Template

### Via Settings Webhook

```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/vondera-sendgrid/webhook/settings' \
  -H 'Content-Type: application/json' \
  --data '{
    "storeId": "store_123",
    "settings": {
      "email_template": "<html>...your template with {{placeholders}}...</html>"
    }
  }'
```

### Via Database

```sql
UPDATE user_settings 
SET email_template = '<html>...your template...</html>'
WHERE store_id = 'store_123';
```

### During Installation

The template can be included in the `setup_data` during installation:

```json
{
  "store_id": "store_123",
  "access_token": "...",
  "refresh_token": "...",
  "setup_data": {
    "sendgrid_api_key": "SG.xxx",
    "sendgrid_from_email": "noreply@example.com",
    "email_template": "<html>...your template...</html>"
  }
}
```

## Template Best Practices

1. **Always use HTML**: Templates must be valid HTML
2. **Include styles**: Use inline CSS or `<style>` tags (email clients don't support external stylesheets)
3. **Test placeholders**: Make sure all placeholders you use are available (see list above)
4. **Handle missing data**: Placeholders will show "N/A" if data is not available
5. **Mobile-friendly**: Use responsive design for mobile email clients
6. **Keep it simple**: Complex layouts may not render correctly in all email clients

## Default Template

If no custom template is provided, the plugin uses a default template that includes:

- Order ID and number
- Total and currency
- Status and marketplace
- Customer information
- Products count
- Order date

The default template is always available and doesn't require any configuration.

## Template Variables Reference

| Placeholder | Description | Example Value |
|------------|-------------|---------------|
| `{{order_id}}` | Vondera order ID | `76216854` |
| `{{order_number}}` | Order number | `76216854` |
| `{{order_total}}` | Total amount | `500` |
| `{{order_currency}}` | Currency code | `EGP` |
| `{{order_status}}` | Order status | `Pending` |
| `{{order_date}}` | Formatted date | `12/20/2025, 5:23:04 AM` |
| `{{order_notes}}` | Order notes | `Notes on order` |
| `{{order_pickup_method}}` | Pickup method | `SHIPPING` |
| `{{order_country}}` | Country code | `EG` |
| `{{order_marketplace}}` | Marketplace | `instagram` |
| `{{order_products_count}}` | Number of products | `1` |
| `{{order_products_list}}` | Products list (HTML) | `Product Name (Qty: 1, Price: 500 EGP)` |
| `{{customer_name}}` | Customer name | `John Doe` |
| `{{customer_email}}` | Customer email | `customer@example.com` |
| `{{customer_phone}}` | Customer phone | `01114055125` |
| `{{customer_address}}` | Customer address | `69 El Dokki St.` |
| `{{payment_method}}` | Payment method | `COD` |
| `{{payment_status}}` | Payment status | `PENDING` |
| `{{payment_shipping_fees}}` | Shipping fees | `0` |
| `{{payment_discount}}` | Discount amount | `0` |
| `{{store_id}}` | Store ID | `W9DhSs7ZbZc9czcsYMr0WtqOCdy2` |

## Testing Templates

1. Set your custom template via the settings webhook
2. Create a test order in Vondera
3. Check the email that was sent
4. Verify all placeholders were replaced correctly
5. Adjust template as needed

## Troubleshooting

### Placeholders not replaced

- Check that placeholders use double curly braces: `{{placeholder}}`
- Verify placeholder names match exactly (case-insensitive)
- Check function logs for template processing errors

### Template not being used

- Verify `email_template` is set in `user_settings` for your store
- Check that the template field is not empty or null
- Ensure the template is valid HTML

### Missing data in template

- Some order fields may not always be available
- Placeholders will show "N/A" if data is missing
- Check the order webhook payload to see what data is available
