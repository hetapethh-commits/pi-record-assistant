#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: npm run release:github -- <version>" >&2
  exit 2
fi

requested_version="${1#v}"
package_version="$(node -p "require('./package.json').version")"
release_tag="v${requested_version}"
repository="hetapethh-commits/pi-record-assistant"
expected_origin="https://github.com/${repository}.git"
branch="$(git branch --show-current)"
origin_url="$(git remote get-url origin)"
release_commit="$(git rev-parse HEAD)"

if [[ "${requested_version}" != "${package_version}" ]]; then
  echo "Requested version ${requested_version} does not match package.json ${package_version}." >&2
  exit 2
fi

if [[ "${branch}" != "main" ]]; then
  echo "Releases must run from main; current branch is ${branch:-detached HEAD}." >&2
  exit 2
fi

if [[ "${origin_url}" != "${expected_origin}" ]]; then
  echo "origin must be ${expected_origin}; found ${origin_url}." >&2
  exit 2
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree must be clean before release." >&2
  exit 2
fi

if git rev-parse --verify --quiet "refs/tags/${release_tag}" >/dev/null || \
  git ls-remote --exit-code --tags origin "refs/tags/${release_tag}" >/dev/null 2>&1; then
  echo "Release tag ${release_tag} already exists." >&2
  exit 2
fi

npm test
npm pack --dry-run
npm run verify:package

if [[ "$(git rev-parse HEAD)" != "${release_commit}" ]] || \
  [[ -n "$(git status --porcelain)" ]]; then
  echo "Repository changed during release verification." >&2
  exit 2
fi

git push origin "${release_commit}:refs/heads/${branch}"

remote_commit="$(git ls-remote origin "refs/heads/${branch}" | awk '{print $1}')"
if [[ "${remote_commit}" != "${release_commit}" ]]; then
  echo "Remote ${branch} does not match tested commit ${release_commit}." >&2
  exit 1
fi

gh release create "${release_tag}" \
  --repo "${repository}" \
  --target "${release_commit}" \
  --title "${release_tag}" \
  --generate-notes

node scripts/verify-package.mjs \
  "git:github.com/${repository}@${release_tag}"

gh release view "${release_tag}" \
  --repo "${repository}" \
  --json url \
  --jq '.url'
