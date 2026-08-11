#!/bin/sh
set -e

# Prefer mounted source over any package installed into site-packages at build time.
export PYTHONPATH="/app${PYTHONPATH:+:$PYTHONPATH}"

exec "$@"
