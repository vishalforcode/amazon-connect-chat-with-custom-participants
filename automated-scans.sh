#!/bin/bash
# Required scanning tools
# 
# git-secrets: https://github.com/awslabs/git-secrets
# npm audit: https://docs.npmjs.com/cli/v10/commands/npm-audit
# semgrep: https://github.com/returntocorp/semgrep
# cdk-nag: https://github.com/cdklabs/cdk-nag

echo "running git-secrets..."
git-secrets --scan
echo -e "...finished\n"

echo "running npm audit..."
npm audit
echo -e "...finished\n"

echo "running semgrep..."
semgrep scan --quiet -config auto
echo -e "...finished\n"

echo "running cdk-nag..."
cdk synth -q
echo -e "...finished"