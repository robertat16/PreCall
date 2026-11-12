# Releasing PreCall: owner's guide

Every step can be done from a phone browser, though a computer is easier for steps 2 and 7.
Times are hands-on time; Google's waiting periods are listed separately.

## 1. Back up the signing key (5 min)
You were given `precall-upload.jks`, `precall-upload.jks.base64` and the keystore password.
Save **all three** in a password manager (e.g. as a secure note with attachments) and in one second place.
Never commit them to GitHub.

## 2. Create the GitHub repository and push the code (15 min)
1. On github.com, tap **+ → New repository**. Name: `precall`. Visibility: **Public**
   (required for the free privacy-policy page; the signing key is never in the repo).
   Leave "Add a README" **unticked**.
2. Upload the project:
   - From a computer: unzip `precall-source.zip`, open a terminal in the folder, then run
     `git remote add origin https://github.com/<you>/precall.git && git push -u origin main`
   - Or ask Claude to push it for you once the repo is connected to a Claude session.

## 3. Add the signing secrets (5 min)
Repo → **Settings → Secrets and variables → Actions**.

**Secrets** tab → *New repository secret*:

| Name | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the entire contents of `precall-upload.jks.base64` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `precall-upload` |

**Variables** tab → *New repository variable*: `SUPPORT_EMAIL` = the email you want users to contact
(it appears in the privacy policy and must match the Play listing).

## 4. Turn on the privacy-policy website (3 min)
Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Then **Actions → Publish privacy policy → Run workflow**.
Your policy is now at `https://<you>.github.io/precall/privacy.html`. Open it to check your email shows.

## 5. Build the app (2 min + ~10 min waiting)
**Actions → Build & test → Run workflow** (it also runs on every push).
When it's green, open the run → **Artifacts** → download `precall-android-NNN`.
Inside: `app-release.aab` (for Play) and `app-release.apk` (to sideload on your own phone).

## 6. Create a Google Play developer account (20 min + 1–3 days verification)
play.google.com/console → personal account → pay the one-time US$25 → verify your identity and phone.

## 7. Create the app and upload the build (30 min)
1. **Create app**: name `PreCall: Mic & Camera Test`, default language English (US), **App**, **Free**.
2. **Test and release → Testing → Closed testing → Create track** (or use the default "Alpha").
   Upload `app-release.aab`. Accept **Play App Signing** when asked.
3. Release name: `1.0.0`; release notes: copy `store/release-notes/1.0.0.txt`.

## 8. Fill in the store listing and app content (45–60 min)
Everything is pre-written in the `store/` folder:
- `store/listing.md`: title, descriptions, category, URLs
- `store/graphics/`: icon and feature graphic
- `store/screenshots/phone/`: 8 ready-made screenshots
- `store/data-safety.md` and `store/play-console-answers.md`: every questionnaire answer

## 9. Closed test: 12 testers for 14 days (Google rule for new personal accounts)
Add at least **12** (aim for 15) testers' Google-account emails to the closed-testing track, or use a Google Group.
Send them the opt-in link. They must stay opted in for **14 consecutive days**. Ask them to actually run a test or two.

## 10. Apply for production (15 min + ~7 days review)
Dashboard → **Apply for production** → answer the short questionnaire about your test.
After approval: **Production → Create release** → promote the same build (staged rollout 20% → 100% is wise).

---

## Shipping updates later
1. Change `"version"` in `package.json` (e.g. `1.0.1`) and add notes to `CHANGELOG.md` and `store/release-notes/`.
2. Push to `main` and tag `v1.0.1`. CI builds a signed AAB and attaches it to a GitHub Release.
3. Upload it in Play Console (or set up automatic uploads, below).

### Optional: automatic uploads to Play
Play Console → **Setup → API access** → create a service account with "Release manager" permission, download its
JSON key, and save it as the repo secret `PLAY_SERVICE_ACCOUNT_JSON`. After the first manual upload,
**Actions → Build & test → Run workflow** with "Upload to Google Play" ticked will publish to the track you choose.

### Notes
- `versionCode` = 1000 + run number × 10 + attempt, so it always increases. Don’t rename `.github/workflows/android.yml`
  (that resets the run counter). If you ever need to, raise the `1000` offset in the workflow.
- If you lose the upload key, Play support can reset it (Play App Signing keeps the real app key safe).
