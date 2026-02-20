#!/bin/bash

# Configuration
APP_ID="com.murat.mancala"
VERSION="1.0.0"
OUTPUT_FILE="${APP_ID}_${VERSION}_all.ipk"
APP_DIR="usr/palm/applications/$APP_ID"

echo "📦 Packaging $APP_ID v$VERSION..."

# Create temporary build directories
rm -rf build_tmp
mkdir -p build_tmp/data/$APP_DIR

# Copy app files
cp appinfo.json index.html *.js *.png build_tmp/data/$APP_DIR/

cd build_tmp

# 1. Create debian-binary
echo "2.0" > debian-binary

# 2. Create control file
mkdir -p control
cat > control/control <<EOF
Package: $APP_ID
Version: $VERSION
Section: misc
Priority: optional
Architecture: all
Maintainer: Murat
Description: Mancala LAN (Peer2Peer)
webOS-Package-Format-Version: 2
EOF

# Package control file
cd control
COPYFILE_DISABLE=1 tar -czf ../control.tar.gz .
cd ..

# 3. Create data.tar.gz
cd data
COPYFILE_DISABLE=1 tar -czf ../data.tar.gz .
cd ..

# 4. Create IPK
ar r "../$OUTPUT_FILE" debian-binary control.tar.gz data.tar.gz

# Cleanup
cd ..
rm -rf build_tmp

echo "✅ Created $OUTPUT_FILE"
ls -la "$OUTPUT_FILE"
