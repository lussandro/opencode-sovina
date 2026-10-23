#!/usr/bin/env bash
# Links this fork's skills into the OpenCode skills directory.
# Usage: script/install-skills.sh [target-dir]    (default: ${XDG_CONFIG_HOME:-~/.config}/opencode/skills)
set -euo pipefail

source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../skills" && pwd)"
target_dir="${1:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode/skills}"
mkdir -p "$target_dir"

status=0
for skill in "$source_dir"/*/; do
  name="$(basename "$skill")"
  link="$target_dir/$name"
  if [ -L "$link" ] && [ "$(readlink "$link")" = "${skill%/}" ]; then
    echo "ok       $name"
  elif [ -e "$link" ] || [ -L "$link" ]; then
    # Never replace something the user put there.
    echo "conflict $name: $link already exists and is not this fork's skill" >&2
    status=1
  else
    ln -s "${skill%/}" "$link"
    echo "linked   $name"
  fi
done
exit $status
