#!/bin/bash

# Exit on any error
set -e

# Change to the parent directory (project root)
cd "$(dirname "$0")/.."

# Source the environment variables from build/.env
source build/.env

# Function to display usage
usage() {
  echo "Usage: $0 [--dryrun|--build|--release]"
  echo "  --dryrun   Simulate the build/release process without executing"
  echo "  --build    Build the application without publishing"
  echo "  --release  Build and publish the application"
  exit 1
}

# Parse arguments
MODE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --dryrun)
      MODE="dryrun"
      shift
      ;;
    --build)
      MODE="build"
      shift
      ;;
    --release)
      MODE="release"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      usage
      ;;
  esac
done

if [ -z "$MODE" ]; then
  echo "Error: No mode specified."
  usage
fi

# Get the version from package.json
VERSION=$(node -p "require('./package.json').version")

# Function to run commands or echo in dryrun
run_or_echo() {
  if [ "$MODE" = "dryrun" ]; then
    echo "Would run: $@"
  else
    "$@"
  fi
}

# Common build steps
echo "Building CSS and TypeScript..."
#run_or_echo npm run build:css
#run_or_echo npx tsc

if [ "$MODE" = "build" ]; then
  echo "Building application v$VERSION..."
  run_or_echo npm run dist:mac
  echo "Build completed successfully!"
elif [ "$MODE" = "release" ]; then
  # Check if GITHUB_TOKEN is set for release
  if [ -z "$GITHUB_TOKEN" ]; then
    echo "Error: GITHUB_TOKEN is not set. Please check build/.env"
    exit 1
  fi

  # Get owner/repo from git remote
  REMOTE_URL=$(git config --get remote.origin.url)
  REPO_INFO=$(echo "$REMOTE_URL" | sed -n -E 's/.*github.com[:/]([^/]+)\/(.*)\.git/\1 \2/p')
  OWNER=$(echo "$REPO_INFO" | cut -d' ' -f1)
  REPO=$(echo "$REPO_INFO" | cut -d' ' -f2)

  if [ -z "$OWNER" ] || [ -z "$REPO" ]; then
    echo "Error: Could not parse repository owner and name from git remote 'origin'."
    exit 1
  fi

  # Check if on the main branch
  if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
    echo "Error: You must be on the 'main' branch to release."
    exit 1
  fi

  # Check if the working directory is clean
  if ! git diff-index --quiet HEAD --; then
    echo "Error: Working directory is not clean. Please commit or stash your changes."
    exit 1
  fi

  # Check if the tag already exists
  TAG_EXISTS=false
  if git rev-parse "$VERSION" >/dev/null 2>&1; then
    echo "Warning: Git tag '$VERSION' already exists. Skipping tag creation and push."
    TAG_EXISTS=true
  fi

  # Generate changelog from commits since the last tag
  LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  CHANGELOG=""

  if [ -n "$LATEST_TAG" ]; then
    echo "Generating changelog from commits since tag: $LATEST_TAG"
    CHANGELOG=$(git log --pretty=format:"- %s" "$LATEST_TAG"..HEAD)
  else
    echo "No previous tag found. Using last 10 commits for changelog."
    CHANGELOG=$(git log --pretty=format:"- %s" -n 10)
  fi

  echo "--------------------------------------------------"
  echo "🚀 Ready to release version: $VERSION"
  echo "--------------------------------------------------"
  echo "Changelog to be included in the tag:"
  echo -e "$CHANGELOG"
  echo "--------------------------------------------------"

  if [ "$MODE" = "dryrun" ]; then
    echo "[DRY RUN] Would build application."
    echo "[DRY RUN] Would create tag '$VERSION'."
    echo "[DRY RUN] Would push tag to origin."
    echo "[DRY RUN] Would create GitHub release."
    echo "[DRY RUN] Would zip dist/mac/ and upload."
    exit 0
  fi

  read -p "Do you want to proceed with the release? (y/n) " -n 1 -r
  echo # Move to a new line
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Release cancelled."
    exit 1
  fi

  # Check if build exists, if not, build the application
  if [ ! -d "dist/mac" ] || [ -z "$(ls -A dist/mac 2>/dev/null)" ]; then
    echo "No built application found in dist/mac/. Building application v$VERSION..."
    run_or_echo npm run dist:mac
  else
    echo "Built application found in dist/mac/. Skipping build."
  fi

  # Create and push a new git tag if it doesn't exist
  if [ "$TAG_EXISTS" = false ]; then
    echo "Creating git tag $VERSION..."
    git tag -a "$VERSION" -m "Release $VERSION" -m "$CHANGELOG"

    echo "Pushing tag to origin..."
    git push origin "$VERSION"
  else
    echo "Skipping tag creation and push as tag already exists."
  fi

  # Check if GitHub release already exists for this tag
  echo "Checking if GitHub release already exists for tag $VERSION..."
  EXISTING_RELEASE_RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/$OWNER/$REPO/releases/tags/$VERSION")

  RELEASE_ID=$(echo "$EXISTING_RELEASE_RESPONSE" | grep -o '"id": *[0-9]*' | head -n 1 | sed 's/"id": *//')
  UPLOAD_URL=$(echo "$EXISTING_RELEASE_RESPONSE" | grep -o '"upload_url": *"[^"]*"' | sed 's/"upload_url": *"\([^"]*\)"/\1/' | sed 's/{?name,label}//')

  if [ -z "$RELEASE_ID" ] || [ -z "$UPLOAD_URL" ]; then
    # Release doesn't exist, create it
    echo "Release does not exist. Creating GitHub release..."
    # Escape the changelog for JSON
    CHANGELOG_ESCAPED=$(printf '%s\n' "$CHANGELOG" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n' | sed 's/\\n$//')

    RELEASE_DATA="{\"tag_name\":\"$VERSION\",\"name\":\"Release $VERSION\",\"body\":\"$CHANGELOG_ESCAPED\",\"draft\":false,\"prerelease\":false}"

    CREATE_RELEASE_RESPONSE=$(curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" -H "Accept: application/vnd.github.v3+json" -d "$RELEASE_DATA" "https://api.github.com/repos/$OWNER/$REPO/releases")

    RELEASE_ID=$(echo "$CREATE_RELEASE_RESPONSE" | grep -o '"id": *[0-9]*' | head -n 1 | sed 's/"id": *//')
    UPLOAD_URL=$(echo "$CREATE_RELEASE_RESPONSE" | grep -o '"upload_url": *"[^"]*"' | sed 's/"upload_url": *"\([^"]*\)"/\1/' | sed 's/{?name,label}//')

    if [ -z "$RELEASE_ID" ] || [ -z "$UPLOAD_URL" ]; then
      echo "Error: Failed to create GitHub release."
      echo "Response: $CREATE_RELEASE_RESPONSE"
      exit 1
    fi
  else
    echo "GitHub release already exists for tag $VERSION. Using existing release."
  fi

  # Check if dist/mac exists and has content before zipping
  if [ ! -d "dist/mac" ] || [ -z "$(ls -A dist/mac 2>/dev/null)" ]; then
    echo "Error: Build directory dist/mac/ does not exist or is empty. Cannot create zip file."
    exit 1
  fi

  # Zip the build files
  echo "Zipping build files from dist/mac/..."
  ZIP_FILE="EverEtch-$VERSION-mac.7z"
  run_or_echo mkdir -p out
  run_or_echo cd dist/mac && 7z a "../../out/$ZIP_FILE" *.app && cd ../..

  # Upload the zip file
  echo "Uploading $ZIP_FILE to GitHub release..."
  curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" -H "Content-Type: application/zip" --data-binary @"out/$ZIP_FILE" "$UPLOAD_URL?name=$ZIP_FILE"

  if [ $? -ne 0 ]; then
    echo "Error: Failed to upload $ZIP_FILE to GitHub release."
    exit 1
  fi
  echo 
  echo "Zip file uploaded successfully."
  echo "Release v$VERSION published successfully!"
elif [ "$MODE" = "dryrun" ]; then
  echo "Dryrun mode: Simulating build and release for v$VERSION"
  echo "Would check GITHUB_TOKEN"
  echo "Would get owner/repo"
  echo "Would check branch and git status"
  echo "Would generate changelog"
  echo "Would build application"
  echo "Would create and push tag"
  echo "Would create GitHub release"
  echo "Would zip and upload"
  echo "Dryrun completed!"
fi
