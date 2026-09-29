#!/usr/bin/env bash
# Builds a clean, installable zip in ./dist (no node_modules / sources / tooling).
set -euo pipefail
cd "$(dirname "$0")/.."
SLUG=bricks-motion-studio
VERSION=$(grep -m1 "Version:" $SLUG.php | awk '{print $NF}')
# Never ship a stale minified build or a file that fails linting.
node bin/check.mjs >/dev/null || { node bin/check.mjs | grep -v OK; echo "Refusing to package: run npm run build:js"; exit 1; }
rm -rf dist && mkdir -p dist/$SLUG
rsync -a ./ dist/$SLUG/ --exclude dist --exclude node_modules --exclude .git --exclude src --exclude bin --exclude tests --exclude docs \
  --exclude package.json --exclude package-lock.json --exclude .DS_Store --exclude '*.map' \
  --exclude README.md --exclude .gitignore --exclude .github \
  --exclude /vendor --exclude composer.json --exclude composer.lock --exclude phpcs.xml.dist \
  --exclude assets/vendor/anime/anime.umd.min.js --exclude assets/vendor/motion/motion.js
# (Full Anime.js / Motion builds are dev-only: bundled mode serves the slim builds, CDN mode
#  loads the full npm builds from jsDelivr with the integrity hashes in includes/data/sri.json.)
( cd dist && zip -qr "$SLUG-$VERSION.zip" $SLUG && rm -rf $SLUG )
echo "dist/$SLUG-$VERSION.zip"
