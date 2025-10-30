#!/bin/bash
# Example: Health Check Script Usage
#
# This script demonstrates various ways to use the health check utility
# for testing deployed Effect-Notion proxy servers.

set -e

echo "=== Health Check Examples ==="
echo ""

# Example 1: Test local development server
echo "1. Testing local development server..."
echo "   Command: bun run health-check http://localhost:3000"
echo "   Note: Requires server to be running (bun run dev)"
echo ""

# Example 2: Test production deployment
echo "2. Testing production deployment..."
echo "   Command: bun run health-check https://your-app.vercel.app"
echo "   Use case: Post-deployment verification"
echo ""

# Example 3: Test staging environment
echo "3. Testing staging environment..."
echo "   Command: bun run health-check https://your-app-staging.vercel.app"
echo "   Use case: Pre-production validation"
echo ""

# Example 4: CI/CD integration
echo "4. CI/CD Integration (GitHub Actions)..."
cat << 'EOF'
   Example workflow:
   
   - name: Health Check
     run: |
       bun install
       bun run health-check ${{ env.DEPLOYMENT_URL }}
       
   Exit code 0 = all checks passed
   Exit code 1 = one or more checks failed
EOF
echo ""

# Example 5: Monitoring integration
echo "5. Monitoring Integration (Cron)..."
cat << 'EOF'
   Add to crontab:
   
   */5 * * * * cd /path/to/project && \
     bun run health-check https://your-app.vercel.app >> \
     /var/log/health-check.log 2>&1
     
   Runs every 5 minutes and logs results
EOF
echo ""

# Example 6: Direct script execution
echo "6. Direct script execution..."
echo "   Command: bun scripts/health-check.ts https://example.com"
echo "   Use case: Custom automation or testing"
echo ""

echo "=== For More Information ==="
echo "See docs/HEALTH_CHECK.md for comprehensive documentation"
