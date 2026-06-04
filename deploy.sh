#!/bin/bash

# Deployment script for Supabase Edge Functions
# Usage: ./deploy.sh

PROJECT_REF="mbijjcpkflglumzybund"

echo "🚀 Deploying Vondera SendGrid Plugin to Supabase Edge Functions..."
echo ""

npm run build

SUPABASE_CLI="npx --yes supabase@latest"

# Check if logged in
if ! $SUPABASE_CLI projects list &> /dev/null; then
    echo "❌ Not logged in to Supabase."
    echo "Login with: supabase login"
    exit 1
fi

echo "📦 Deploying main webhook function (vondera-sendgrid)..."
$SUPABASE_CLI functions deploy vondera-sendgrid --project-ref $PROJECT_REF --no-verify-jwt

if [ $? -ne 0 ]; then
    echo "❌ Failed to deploy vondera-sendgrid function"
    exit 1
fi

echo ""
echo "📧 Deploying order email function (send-order-email)..."
$SUPABASE_CLI functions deploy send-order-email --project-ref $PROJECT_REF --no-verify-jwt

if [ $? -ne 0 ]; then
    echo "❌ Failed to deploy send-order-email function"
    exit 1
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "1. Set environment variables (secrets):"
echo "   supabase secrets set VONDERA_CLIENT_ID=your_client_id --project-ref $PROJECT_REF"
echo "   supabase secrets set VONDERA_CLIENT_SECRET=your_client_secret --project-ref $PROJECT_REF"
echo "   supabase secrets set VONDERA_APP_ID=your_app_id --project-ref $PROJECT_REF"
echo "   supabase secrets set SENDGRID_FROM_EMAIL=noreply@example.com --project-ref $PROJECT_REF"
echo ""
echo "2. Set up database webhook (see database/trigger_send_email.sql)"
echo ""
echo "3. Test your functions:"
echo "   curl -L -X GET 'https://$PROJECT_REF.supabase.co/functions/v1/vondera-sendgrid/health'"

