#!/bin/bash

# Script to sync fork with upstream sst/opencode repository (dev branch)

set -e

echo "🔄 Syncing fork with upstream sst/opencode dev branch..."

# Check if upstream remote exists, if not add it
if ! git remote | grep -q "upstream"; then
    echo "➕ Adding upstream remote..."
    git remote add upstream https://github.com/sst/opencode.git
else
    echo "✅ Upstream remote already exists"
fi

# Fetch latest changes from upstream
echo "📥 Fetching latest changes from upstream..."
git fetch upstream

# Get current branch name
CURRENT_BRANCH=$(git branch --show-current)
echo "📍 Current branch: $CURRENT_BRANCH"

# Switch to dev branch
DEV_BRANCH="dev"
echo "🔀 Switching to $DEV_BRANCH branch..."
git checkout $DEV_BRANCH

# Pull latest changes from upstream dev branch
echo "⬇️ Pulling latest changes from upstream/$DEV_BRANCH..."
git pull upstream $DEV_BRANCH

# Push updated dev branch to your fork
echo "⬆️ Pushing updated $DEV_BRANCH to your fork..."
git push origin $DEV_BRANCH

# Switch back to original branch if it wasn't dev
if [ "$CURRENT_BRANCH" != "$DEV_BRANCH" ]; then
    echo "🔄 Switching back to $CURRENT_BRANCH..."
    git checkout $CURRENT_BRANCH
    
    echo "🤔 Would you like to rebase $CURRENT_BRANCH onto updated $DEV_BRANCH? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "🔄 Rebasing $CURRENT_BRANCH onto $DEV_BRANCH..."
        git rebase $DEV_BRANCH
        echo "✅ Rebase complete!"
    fi
fi

echo "✨ Sync complete! Your fork is now up to date with sst/opencode dev branch"