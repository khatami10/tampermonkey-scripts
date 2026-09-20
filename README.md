# Tampermonkey scripts

Personal userscripts with direct installation links and automatic updates through Tampermonkey.

## TikTok

[Install TikTok LIVE Companion](https://raw.githubusercontent.com/khatami10/tampermonkey-scripts/main/tiktok/TikTok-Live-Companion.user.js) — version 0.7.1. Tampermonkey uses this same stable URL for automatic updates.

The Companion currently includes independently switchable Battle/PK Repair and Gift Tracker modules. Existing standalone auto-like scripts are not included or modified.

[Install TikTok Battle Repair](https://raw.githubusercontent.com/khatami10/tampermonkey-scripts/main/tiktok/TikTok-Battle-Repair.user.js) — version 2.6.8, based on the latest local 2.6.7 script.

Open the install link with Tampermonkey enabled, then click Install in Tampermonkey. If you already have an installed copy, review Tampermonkey's replacement prompt first. Only enable one version of Battle Repair at a time.

This release adds update metadata; the executable script body is unchanged. The existing name and namespace are preserved for upgrade compatibility. The version in the display name is retained as part of the original script identity; @version is the release version.

## Future updates

Keep tiktok/TikTok-Battle-Repair.user.js at this stable path. Increase @version using semantic versioning for every release. Keep @name and @namespace stable. Both @updateURL and @downloadURL point to the raw file on main. Enable script update checks in Tampermonkey; updates follow its configured check schedule.

Older local revisions are superseded versions of the same script, so they are not separate install choices. Add distinct TikTok tools under tiktok/ with their own stable .user.js filenames.

Reference: https://www.tampermonkey.net/documentation.php
