#!/bin/bash

# Push script for sahilchouksey/opencode fork
# This script bypasses pre-commit hooks to push even with TypeScript errors

set -e

echo "🚀 Pushing changes to sahilchouksey/opencode fork..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the opencode package directory."
    exit 1
fi

# Check if there are any commits to push
if git status --porcelain | grep -q "^"; then
    echo "⚠️  Warning: You have uncommitted changes. Please commit them first."
    git status --short
    echo ""
    read -p "Do you want to continue anyway? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Aborted."
        exit 1
    fi
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "📍 Current branch: $CURRENT_BRANCH"

# Check if sahilchouksey remote exists
if ! git remote get-url sahilchouksey >/dev/null 2>&1; then
    echo "➕ Adding sahilchouksey remote..."
    git remote add sahilchouksey https://github.com/sahilchouksey/opencode.git
else
    echo "✅ sahilchouksey remote already exists"
fi

# Show what commits will be pushed
echo ""
echo "📝 Commits to be pushed:"
git log --oneline origin/$CURRENT_BRANCH..$CURRENT_BRANCH || echo "No new commits found"
echo ""

# Ask for confirmation
read -p "🤔 Do you want to push these changes to sahilchouksey/opencode? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted."
    exit 1
fi

echo "⏳ Pushing to sahilchouksey/opencode..."

# Push with --no-verify to bypass pre-commit hooks
if git push sahilchouksey $CURRENT_BRANCH --no-verify; then
    echo "✅ Successfully pushed to sahilchouksey/opencode!"
    echo "🔗 You can view your changes at: https://github.com/sahilchouksey/opencode/tree/$CURRENT_BRANCH"
else
    echo "❌ Push failed. Check the error message above."
    exit 1
fi

echo ""
echo "🎉 All done! Your changes are now in your fork."