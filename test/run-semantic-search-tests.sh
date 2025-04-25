#!/bin/bash

# Change to the memory module directory
cd "$(dirname "$0")/.."

# Make sure the code is built
echo "Building the memory module..."
npm run build

# Run the semantic search tests
echo "Running semantic search tests..."
node test/test-semantic-search.js
