#!/bin/bash

# Fetch the latest tags from origin
git fetch --tags

# Get the latest tag
latest_tag=$(git tag --sort=-v:refname | head -n 1)

# Check if no tags exist
if [[ -z "$latest_tag" ]]; then
    echo "No tags found. Starting from v0.0.1"
    new_tag="v0.0.1"
else
    echo "Latest tag: $latest_tag"

    # Extract major, minor, and patch numbers
    if [[ "$latest_tag" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
        major="${BASH_REMATCH[1]}"
        minor="${BASH_REMATCH[2]}"
        patch="${BASH_REMATCH[3]}"
        
        # Increment the patch version
        new_patch=$((patch + 1))
        new_tag="v${major}.${minor}.${new_patch}"
    else
        echo "Tag format is incorrect. Expected format: v0.0.0"
        exit 1
    fi
fi

echo "New tag: $new_tag"

# Create new tag
git tag "$new_tag"

# Push the new tag to origin
git push origin "$new_tag"

echo "Tag $new_tag pushed to origin successfully."
