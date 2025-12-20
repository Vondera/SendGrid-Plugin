-- Migration: Add webhook fields to user_tokens table
-- Run this if you already have the user_tokens table created

-- Add new columns if they don't exist
DO $$ 
BEGIN
    -- Add installation_id column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='user_tokens' AND column_name='installation_id') THEN
        ALTER TABLE user_tokens ADD COLUMN installation_id VARCHAR(255);
    END IF;

    -- Add app_id column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='user_tokens' AND column_name='app_id') THEN
        ALTER TABLE user_tokens ADD COLUMN app_id VARCHAR(255);
    END IF;

    -- Add scopes column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='user_tokens' AND column_name='scopes') THEN
        ALTER TABLE user_tokens ADD COLUMN scopes TEXT[];
    END IF;

    -- Add expires_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='user_tokens' AND column_name='expires_at') THEN
        ALTER TABLE user_tokens ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

