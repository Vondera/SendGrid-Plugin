-- Migration: Add email status and order tracking fields to orders table
-- Run this if you already have the orders table created

-- Add new columns if they don't exist
DO $$ 
BEGIN
    -- Add vondera_order_id column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='vondera_order_id') THEN
        ALTER TABLE orders ADD COLUMN vondera_order_id VARCHAR(255);
        -- Make it unique and not null after adding data
        UPDATE orders SET vondera_order_id = order_number WHERE vondera_order_id IS NULL;
        ALTER TABLE orders ALTER COLUMN vondera_order_id SET NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_vondera_order_id ON orders(vondera_order_id);
    END IF;

    -- Add customer_name column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='customer_name') THEN
        ALTER TABLE orders ADD COLUMN customer_name VARCHAR(255);
    END IF;

    -- Add customer_phone column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='customer_phone') THEN
        ALTER TABLE orders ADD COLUMN customer_phone VARCHAR(255);
    END IF;

    -- Add currency column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='currency') THEN
        ALTER TABLE orders ADD COLUMN currency VARCHAR(10);
    END IF;

    -- Rename status to order_status if needed
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name='orders' AND column_name='status' 
               AND column_name != 'order_status') THEN
        ALTER TABLE orders RENAME COLUMN status TO order_status;
    END IF;

    -- Add order_status if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='order_status') THEN
        ALTER TABLE orders ADD COLUMN order_status VARCHAR(50);
    END IF;

    -- Add email_status column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='email_status') THEN
        ALTER TABLE orders ADD COLUMN email_status VARCHAR(50) DEFAULT 'pending';
    END IF;

    -- Add email_sent_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='email_sent_at') THEN
        ALTER TABLE orders ADD COLUMN email_sent_at TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add email_error column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='email_error') THEN
        ALTER TABLE orders ADD COLUMN email_error TEXT;
    END IF;

    -- Add order_data column (JSONB for full order data)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='order_data') THEN
        ALTER TABLE orders ADD COLUMN order_data JSONB;
    END IF;

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_orders_email_status ON orders(email_status);
END $$;

