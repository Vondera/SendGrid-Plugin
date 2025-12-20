# Vondera SendGrid Plugin

A production-ready Vondera plugin that automatically sends SendGrid email notifications when new orders are received. Built with Supabase Edge Functions and PostgreSQL.

## 🚀 Features

- ✅ **Plugin Installation**: Automatically captures and stores access/refresh tokens when users install the plugin
- ✅ **Plugin Uninstallation**: Removes all user data (tokens, settings, orders) when users uninstall
- ✅ **Order Email Notifications**: Automatically sends SendGrid emails when new orders are created
- ✅ **Settings Management**: Handles user settings changes (SendGrid API keys, email preferences)
- ✅ **Order Tracking**: Saves all orders to database with email status tracking (`pending`, `sent`, `failed`)
- ✅ **Settings Retrieval**: Get user settings by storeId via API endpoint
- ✅ **Comprehensive Logging**: Detailed logs for debugging and monitoring

## 🏗️ Architecture

This plugin is built as **Supabase Edge Functions** (serverless Deno runtime):

- **vondera-sendgrid**: Main webhook handler for install/uninstall/settings
- **send-order-email**: Order email sender triggered by Vondera webhooks

## 📋 Prerequisites

- **Supabase Account**: [supabase.com](https://supabase.com) - Free tier works
- **SendGrid Account**: [sendgrid.com](https://sendgrid.com) - Free tier: 100 emails/day
- **Vondera Developer Account**: For plugin registration
- **Supabase CLI**: For deployment (see installation below)
- **Node.js** (optional): For local development and using the VonderaPlugin SDK

## 🛠️ Installation

### 1. Install Supabase CLI

**macOS:**

```bash
brew install supabase/tap/supabase
```

**Other platforms:** See [Supabase CLI Installation](https://github.com/supabase/cli#install-the-cli)

**Note:** Do NOT use `npm install -g supabase` as it's not supported.

### 2. Login to Supabase

```bash
supabase login
```

### 3. Set Up Supabase Project

1. Create a new project at [supabase.com](https://supabase.com)
2. Get your credentials from **Settings** → **API**:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ Use this, not the anon key!

### 4. Set Up Database

1. Go to **SQL Editor** in your Supabase dashboard
2. Copy and paste the entire contents of `database/schema.sql`
3. Click **Run** to create all tables

**If you already have tables**, run the migration files:

- `database/migration_add_webhook_fields.sql` - Adds webhook fields to user_tokens
- `database/migration_add_email_status.sql` - Adds email status fields to orders

### 5. Configure Environment Variables

Set secrets for your functions:

```bash
# Replace mbijjcpkflglumzybund with your project ref
PROJECT_REF="mbijjcpkflglumzybund"

# Vondera credentials (get from Vondera developer dashboard)
supabase secrets set VONDERA_CLIENT_ID=your_client_id --project-ref $PROJECT_REF
supabase secrets set VONDERA_CLIENT_SECRET=your_client_secret --project-ref $PROJECT_REF
supabase secrets set VONDERA_APP_ID=your_app_id --project-ref $PROJECT_REF
supabase secrets set VONDERA_LOCALE=en --project-ref $PROJECT_REF
supabase secrets set VONDERA_TIMEZONE=Africa/Cairo --project-ref $PROJECT_REF

# SendGrid (optional - can be set per store in settings)
supabase secrets set SENDGRID_FROM_EMAIL=noreply@example.com --project-ref $PROJECT_REF
```

**Note:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available in Edge Functions.

### 6. Deploy Functions

```bash
# Deploy main webhook handler
supabase functions deploy vondera-sendgrid --project-ref mbijjcpkflglumzybund --no-verify-jwt

# Deploy order email sender
supabase functions deploy send-order-email --project-ref mbijjcpkflglumzybund --no-verify-jwt
```

Or use the deployment script:

```bash
./deploy.sh
```

## 📦 Using the VonderaPlugin SDK

This plugin uses the [VonderaPlugin SDK](https://www.npmjs.com/package/vondera-app-developer) for interacting with the Vondera API. While the Edge Functions use a simplified client implementation, you can use the full SDK for local development, testing, or custom integrations.

### Installation

```bash
npm install vondera-app-developer
```

### Basic Usage

```javascript
const { VonderaApp } = require('vondera-app-developer');

// Initialize the Vondera client
const vonderaApp = new VonderaApp({
  clientId: process.env.VONDERA_CLIENT_ID,
  clientSecret: process.env.VONDERA_CLIENT_SECRET,
  appId: process.env.VONDERA_APP_ID,
  locale: 'en',
  timezone: 'Africa/Cairo'
});

// Set access token (received from installation webhook)
vonderaApp.setAccessToken(accessToken);

// Make API calls
const orders = await vonderaApp.getOrders();
const store = await vonderaApp.getStore(storeId);
```

### Configuration Options

The VonderaApp constructor accepts:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `clientId` | string | Yes | Your Vondera app client ID (from developer dashboard) |
| `clientSecret` | string | Yes | Your Vondera app client secret (from developer dashboard) |
| `appId` | string | Yes | Your Vondera app ID (from developer dashboard) |
| `locale` | string | No | Locale code (default: `'en'`) |
| `timezone` | string | No | Timezone (default: `'Africa/Cairo'`) |

### Common Methods

The SDK provides methods to interact with the Vondera API:

```javascript
// Get orders for a store
const orders = await vonderaApp.getOrders({
  storeId: 'store_123',
  status: 'pending',
  limit: 50
});

// Get a specific order by ID
const order = await vonderaApp.getOrder(orderId);

// Get store information
const store = await vonderaApp.getStore(storeId);

// Get products for a store
const products = await vonderaApp.getProducts(storeId);

// Refresh access token when it expires
const newToken = await vonderaApp.refreshToken(refreshToken);
```

### Webhook Handling Example

Use the SDK in your webhook handlers to interact with Vondera:

```javascript
const express = require('express');
const { VonderaApp } = require('vondera-app-developer');
const app = express();

app.use(express.json());

// Initialize Vondera client
const vonderaApp = new VonderaApp({
  clientId: process.env.VONDERA_CLIENT_ID,
  clientSecret: process.env.VONDERA_CLIENT_SECRET,
  appId: process.env.VONDERA_APP_ID,
});

// Installation webhook
app.post('/webhook/install', async (req, res) => {
  const { store_id, access_token, refresh_token } = req.body;
  
  try {
    // Set access token for this store
    vonderaApp.setAccessToken(access_token);
    
    // Optionally fetch store details
    const store = await vonderaApp.getStore(store_id);
    
    // Store tokens in database
    await saveTokens(store_id, access_token, refresh_token);
    
    res.json({ success: true, store });
  } catch (error) {
    console.error('Installation error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### Error Handling

Handle token expiration and API errors:

```javascript
async function fetchOrdersWithRetry(vonderaApp, refreshToken) {
  try {
    const orders = await vonderaApp.getOrders();
    return orders;
  } catch (error) {
    if (error.status === 401 || error.statusCode === 401) {
      // Token expired, refresh it
      console.log('Token expired, refreshing...');
      const newToken = await vonderaApp.refreshToken(refreshToken);
      vonderaApp.setAccessToken(newToken);
      
      // Update token in database
      await updateToken(storeId, newToken);
      
      // Retry request
      return await vonderaApp.getOrders();
    }
    throw error;
  }
}
```

### TypeScript Support

The package includes TypeScript definitions:

```typescript
import { VonderaApp, VonderaConfig, Order, Store } from 'vondera-app-developer';

const config: VonderaConfig = {
  clientId: process.env.VONDERA_CLIENT_ID!,
  clientSecret: process.env.VONDERA_CLIENT_SECRET!,
  appId: process.env.VONDERA_APP_ID!,
  locale: 'en',
  timezone: 'Africa/Cairo'
};

const vonderaApp = new VonderaApp(config);
const orders: Order[] = await vonderaApp.getOrders();
```

### Local Development Setup

For local development and testing:

```bash
# Install dependencies
npm install vondera-app-developer

# Create .env file
cat > .env << EOF
VONDERA_CLIENT_ID=your_client_id
VONDERA_CLIENT_SECRET=your_client_secret
VONDERA_APP_ID=your_app_id
VONDERA_LOCALE=en
VONDERA_TIMEZONE=Africa/Cairo
EOF

# Run your local server
node server.js
```

### Documentation & Resources

For complete API documentation and latest updates:

- **NPM Package**: [vondera-app-developer](https://www.npmjs.com/package/vondera-app-developer)
- **Vondera Developer Portal**: Check your Vondera developer dashboard for API documentation
- **GitHub Repository**: [Vondera/SendGrid-Plugin](https://github.com/Vondera/SendGrid-Plugin)

### Important Notes

⚠️ **Edge Functions Implementation**: The Supabase Edge Functions use a simplified client implementation optimized for the serverless Deno runtime. The full SDK features are available when using the npm package in Node.js environments.

⚠️ **Token Management**: Always store access and refresh tokens securely. The Edge Functions automatically handle token storage in the database, but in custom implementations, ensure proper token management and refresh logic.

⚠️ **API Rate Limits**: Be aware of Vondera API rate limits when making multiple requests. Implement proper error handling and retry logic.

## 🔗 Configure Vondera Webhooks

In your Vondera developer dashboard, set the webhook URLs to:

- **Install:** `https://mbijjcpkflglumzybund.supabase.co/functions/v1/vondera-sendgrid/webhook/install`
- **Uninstall:** `https://mbijjcpkflglumzybund.supabase.co/functions/v1/vondera-sendgrid/webhook/uninstall`
- **Settings:** `https://mbijjcpkflglumzybund.supabase.co/functions/v1/vondera-sendgrid/webhook/settings`
- **Order Created:** `https://mbijjcpkflglumzybund.supabase.co/functions/v1/send-order-email`

Replace `mbijjcpkflglumzybund` with your Supabase project reference ID.

## 📡 API Endpoints

### Main Function (`vondera-sendgrid`)

Base URL: `https://[PROJECT_REF].supabase.co/functions/v1/vondera-sendgrid`

#### Health Check

```
GET /health
```

Returns server status and timestamp.

#### Installation Webhook

```
POST /webhook/install
```

Receives installation data from Vondera and stores tokens + settings.

**Request Body:**

```json
{
  "store_id": "store_123",
  "access_token": "access_token_here",
  "refresh_token": "refresh_token_here",
  "setup_data": {
    "sendgrid_api_key": "SG.xxx",
    "sendgrid_from_email": "noreply@example.com"
  }
}
```

**Response:**

```json
{
  "success": true,
  "message": "Tokens stored successfully",
  "store_id": "store_123"
}
```

#### Uninstallation Webhook

```
POST /webhook/uninstall
```

Removes all user data (tokens, settings, orders) when plugin is uninstalled.

**Request Body:**

```json
{
  "store_id": "store_123"
}
```

#### Settings Webhook

```
POST /webhook/settings
```

Updates user settings (SendGrid API keys, email preferences).

**Request Body:**

```json
{
  "storeId": "store_123",
  "settings": {
    "sendgrid_api_key": "SG.xxx",
    "sendgrid_from_email": "noreply@example.com",
    "email_template": "d-1234567890abcdef",  // SendGrid Template ID (starts with d-) OR Custom HTML template
    "enabled": true
  }
}
```

#### Get Settings

```
GET /api/settings/:storeId
```

Retrieves user settings by store ID.

**Example:**

```bash
curl https://mbijjcpkflglumzybund.supabase.co/functions/v1/vondera-sendgrid/api/settings/store_123
```

### Order Email Function (`send-order-email`)

Base URL: `https://[PROJECT_REF].supabase.co/functions/v1/send-order-email`

This function is triggered automatically by Vondera webhooks when a new order is created.

**Webhook Payload (from Vondera):**

```json
{
  "trigger": "orders.created",
  "storeId": "W9DhSs7ZbZc9czcsYMr0WtqOCdy2",
  "body": {
    "id": "76216854",
    "customer": {
      "email": "customer@example.com",
      "name": "John Doe",
      "phone": "01114055125"
    },
    "payment": {
      "totalPrice": 500,
      "currency": "EGP"
    },
    "status": "Pending",
    ...
  }
}
```

## 🗄️ Database Schema

### `user_tokens`

Stores access and refresh tokens for each store installation.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `store_id` | VARCHAR(255) | Unique store identifier |
| `installation_id` | VARCHAR(255) | Vondera installation ID |
| `app_id` | VARCHAR(255) | Vondera app ID |
| `access_token` | TEXT | Access token |
| `refresh_token` | TEXT | Refresh token |
| `scopes` | TEXT[] | OAuth scopes |
| `expires_at` | TIMESTAMP | Token expiration |
| `installed_at` | TIMESTAMP | Installation timestamp |
| `created_at` | TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | Last update time |

### `user_settings`

Stores per-store SendGrid configuration and preferences.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `store_id` | VARCHAR(255) | Unique store identifier |
| `sendgrid_api_key` | TEXT | SendGrid API key |
| `sendgrid_from_email` | VARCHAR(255) | From email address |
| `notification_email` | VARCHAR(255) | Notification recipient |
| `email_template` | TEXT | SendGrid Template ID (starts with `d-`) OR Custom HTML template |
| `enabled` | BOOLEAN | Enable/disable emails (default: true) |
| `created_at` | TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | Last update time |

### `orders`

Stores all orders with email status tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `vondera_order_id` | VARCHAR(255) | Vondera's order ID (unique) |
| `store_id` | VARCHAR(255) | Store identifier |
| `order_number` | VARCHAR(255) | Order number |
| `customer_email` | VARCHAR(255) | Customer email |
| `customer_name` | VARCHAR(255) | Customer name |
| `customer_phone` | VARCHAR(255) | Customer phone |
| `total` | DECIMAL(10,2) | Order total |
| `currency` | VARCHAR(10) | Currency code |
| `order_status` | VARCHAR(50) | Order status (Pending, Completed, etc.) |
| `email_status` | VARCHAR(50) | Email status: `pending`, `sent`, `failed` |
| `email_sent_at` | TIMESTAMP | When email was sent |
| `email_error` | TEXT | Error message if email failed |
| `order_data` | JSONB | Full order data from Vondera |
| `created_at` | TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | Last update time |

## 🔄 How It Works

### Installation Flow

1. User installs plugin in Vondera
2. Vondera sends webhook to `/webhook/install`
3. Function stores:
   - Access/refresh tokens in `user_tokens`
   - Settings from `setup_data` in `user_settings`
4. Returns success response

### Order Email Flow

1. New order created in Vondera
2. Vondera sends webhook to `send-order-email` function
3. Function:
   - Saves order to `orders` table with `email_status: 'pending'`
   - Fetches user settings for the store
   - Validates email configuration
   - Sends email via SendGrid API
   - Updates `email_status` to `'sent'` or `'failed'`

### Uninstallation Flow

1. User uninstalls plugin in Vondera
2. Vondera sends webhook to `/webhook/uninstall`
3. Function deletes:
   - All tokens from `user_tokens`
   - All settings from `user_settings`
   - All orders from `orders`
4. Returns success response

## 📊 Monitoring & Logs

View function logs in Supabase Dashboard:

1. Go to **Edge Functions** in your project
2. Click on a function name
3. View **Logs** tab

Or via CLI:

```bash
supabase functions logs vondera-sendgrid --project-ref mbijjcpkflglumzybund
supabase functions logs send-order-email --project-ref mbijjcpkflglumzybund
```

## 🐛 Troubleshooting

### Function returns 404

- Verify the function name matches exactly
- Check that deployment was successful
- Ensure you're using the correct project ref

### Email not sending

- Check function logs for errors
- Verify SendGrid API key is valid and has sending permissions
- Ensure "from" email is verified in SendGrid (Settings → Sender Authentication)
- Check that `enabled` is `true` in user settings
- Verify customer email exists in order data

### Database errors

- Ensure tables exist (run `database/schema.sql`)
- Check that `vondera_order_id` is unique (no duplicates)
- Verify store_id matches between tables

### Settings not saving

- Check webhook payload structure matches expected format
- Verify `setup_data` contains the settings fields
- Check function logs for validation errors

## 🔒 Security

1. **No Authentication Required**: Functions are deployed with `--no-verify-jwt` flag for public access
2. **Service Role Key**: Automatically available in Edge Functions (server-side only)
3. **API Keys**: Stored as Supabase secrets, never in code
4. **CORS**: Currently allows all origins (`*`). Restrict in production if needed
5. **Webhook Validation**: Consider adding signature verification if Vondera provides webhook secrets

## 📁 Project Structure

```
.
├── supabase/
│   └── functions/
│       ├── vondera-sendgrid/      # Main webhook handler
│       │   ├── index.ts           # Install/uninstall/settings handlers
│       │   └── deno.json          # Deno configuration
│       └── send-order-email/      # Order email sender
│           ├── index.ts           # Email sending logic
│           └── deno.json         # Deno configuration
├── database/
│   ├── schema.sql                 # Complete database schema (run this first)
│   ├── migration_add_webhook_fields.sql # Migration: Add webhook fields to user_tokens
│   └── migration_add_email_status.sql   # Migration: Add email status to orders
├── deploy.sh                      # Deployment script
├── .env.example                   # Environment variables template
├── .gitignore
├── package.json                   # Node.js dependencies (for local dev)
└── README.md                      # This file
```

## 🚀 Deployment

### Quick Deploy

```bash
./deploy.sh
```

### Manual Deploy

```bash
# Deploy both functions
supabase functions deploy vondera-sendgrid --project-ref YOUR_PROJECT_REF --no-verify-jwt
supabase functions deploy send-order-email --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

### Update Secrets

```bash
supabase secrets set KEY=value --project-ref YOUR_PROJECT_REF
```

## 💰 Cost Considerations

**Supabase Edge Functions:**

- Free tier: 500K invocations/month
- Pro tier: 2M invocations/month included
- Additional: $0.0000002 per invocation

**SendGrid:**

- Free tier: 100 emails/day
- Essentials: $19.95/month for 50K emails

Monitor usage in Supabase Dashboard → Edge Functions.

## 📝 License

ISC

## 🤝 Support

For issues or questions:

1. Check function logs in Supabase Dashboard
2. Review troubleshooting section above
3. Verify webhook payloads match expected format
4. Ensure database tables are created correctly

## 📧 Email Templates

The plugin supports **three ways** to customize email templates using the `email_template` field:

### Option 1: SendGrid Dynamic Templates (Recommended) ⭐

Use SendGrid's professional template builder with drag-and-drop interface:

1. **Create a template** in [SendGrid Dashboard](https://app.sendgrid.com) → Email API → Dynamic Templates
2. **Get the Template ID** (starts with `d-`)
3. **Set it in your settings** (just the template ID):

```json
{
  "storeId": "store_123",
  "settings": {
    "email_template": "d-1234567890abcdef"
  }
}
```

**How it works:** If `email_template` starts with `d-`, the plugin treats it as a SendGrid Template ID.

**Benefits:**
- ✅ Visual drag-and-drop editor
- ✅ Better deliverability
- ✅ Responsive design
- ✅ Version control
- ✅ No code changes needed

See [SENDGRID_TEMPLATES.md](./SENDGRID_TEMPLATES.md) for complete guide on creating SendGrid templates.

### Option 2: Custom HTML Templates

Create a custom HTML template with placeholders:

```json
{
  "storeId": "store_123",
  "settings": {
    "email_template": "<html><body><h1>New Order #{{order_number}}</h1><p>Customer: {{customer_name}}</p><p>Total: {{order_total}} {{order_currency}}</p></body></html>"
  }
}
```

Available placeholders: `{{order_id}}`, `{{order_number}}`, `{{order_total}}`, `{{customer_name}}`, `{{customer_email}}`, `{{order_products_list}}`, and more. See [TEMPLATE_GUIDE.md](./TEMPLATE_GUIDE.md) for the complete list.

### Option 3: Default Template

If `email_template` is not set, the plugin uses a built-in default template.

**Priority:** SendGrid Template ID (if starts with `d-`) → Custom HTML Template → Default Template

## 📚 Additional Resources

- [SENDGRID_TEMPLATES.md](./SENDGRID_TEMPLATES.md) - Complete guide for creating SendGrid Dynamic Templates (Recommended)
- [TEMPLATE_GUIDE.md](./TEMPLATE_GUIDE.md) - Guide for custom HTML templates with placeholders
- **Supabase Documentation**: [supabase.com/docs](https://supabase.com/docs)
- **SendGrid API Documentation**: [docs.sendgrid.com](https://docs.sendgrid.com)
- **Vondera Developer Docs**: Check Vondera developer portal
- **Supabase Edge Functions**: [supabase.com/docs/guides/functions](https://supabase.com/docs/guides/functions)

## 🔄 Migration from Express.js

This project was migrated from Express.js to Supabase Edge Functions. The old Express.js code has been removed. All functionality is now handled by serverless Edge Functions.

## 📊 Project Statistics

- **2 Edge Functions**: vondera-sendgrid, send-order-email
- **3 Database Tables**: user_tokens, user_settings, orders
- **4 Webhook Endpoints**: install, uninstall, settings, order-created
- **1 API Endpoint**: Get settings by storeId

---

**Built with ❤️ for Vondera**
