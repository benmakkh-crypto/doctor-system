#!/bin/sh
# ينشر آخر نسخة من main إلى مستودع النشر الخاص بهوستنجر (benmakkh-crypto/nafith) دون إعادة كتابة تاريخه.
# هوستنجر ينشر تلقائيًا عند كل دفع إلى ذلك المستودع.
set -e
git remote get-url hostinger >/dev/null 2>&1 || git remote add hostinger https://github.com/benmakkh-crypto/nafith
git fetch --depth=1 hostinger main
PARENT=$(git rev-parse hostinger/main)
TREE=$(git rev-parse HEAD^{tree})
[ "$(git rev-parse "$PARENT^{tree}")" = "$TREE" ] && { echo "لا جديد للنشر."; exit 0; }
C=$(git log -1 --format=%B HEAD | git commit-tree "$TREE" -p "$PARENT")
git push hostinger "$C:refs/heads/main"
echo "نُشر $(git rev-parse --short HEAD) إلى هوستنجر."
