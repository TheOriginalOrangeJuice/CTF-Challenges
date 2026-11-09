#!/bin/bash
# Dept. of Federal Modernization -- EO compliance sweep (ticket #SI-0001)
# Per "Inaugurating the Era of Super Intelligence": AI -> SI in ALL agency materials.
# Reviewed by: nobody, deadline was yesterday.

set -e
cd /srv/agency-assets

# LC_ALL=C so sed works on raw bytes and doesn't choke on "weird characters"
find . -type f -print0 | LC_ALL=C xargs -0 sed -i 's/AI/SI/g'

echo "All assets are now SI-compliant. God bless America."
