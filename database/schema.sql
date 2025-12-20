-- Vondera SendGrid Plugin Database Schema

-- Table for storing user access and refresh tokens
CREATE TABLE IF NOT EXISTS user_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id VARCHAR(255) UNIQUE NOT NULL,
  installation_id VARCHAR(255),
  app_id VARCHAR(255),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  scopes TEXT[],
  expires_at TIMESTAMP WITH TIME ZONE,
  installed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for storing user settings (SendGrid API keys, email preferences, etc.)
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id VARCHAR(255) UNIQUE NOT NULL,
  sendgrid_api_key TEXT,
  sendgrid_from_email VARCHAR(255),
  notification_email VARCHAR(255),
  email_template TEXT, -- SendGrid Template ID (starts with d-) OR Custom HTML template
  enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for storing orders (this should match your Vondera orders structure)
-- Adjust fields based on your actual order schema
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vondera_order_id VARCHAR(255) UNIQUE NOT NULL, -- Vondera's order ID
  store_id VARCHAR(255) NOT NULL,
  order_number VARCHAR(255),
  customer_email VARCHAR(255),
  customer_name VARCHAR(255),
  customer_phone VARCHAR(255),
  total DECIMAL(10, 2),
  currency VARCHAR(10),
  order_status VARCHAR(50), -- Order status from Vondera (Pending, Completed, etc.)
  email_status VARCHAR(50) DEFAULT 'pending', -- Email sending status: pending, sent, failed
  email_sent_at TIMESTAMP WITH TIME ZONE,
  email_error TEXT, -- Error message if email failed
  order_data JSONB, -- Full order data from Vondera webhook
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_tokens_store_id ON user_tokens(store_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_store_id ON user_settings(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_vondera_order_id ON orders(vondera_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_email_status ON orders(email_status);

-- Enable Row Level Security (RLS) if needed
-- ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Create policies if using RLS
-- Example policy (adjust based on your security requirements):
-- CREATE POLICY "Users can only access their own tokens" ON user_tokens
--   FOR ALL USING (auth.uid()::text = store_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_user_tokens_updated_at BEFORE UPDATE ON user_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

