# Releasing PreCall: owner's guide

Most steps work from a phone browser. Step 2 is easiest if Claude does it; steps 6–8 are easier on a computer.
Times are hands-on time; Google's waiting periods are listed separately.

## 1. Back up the signing key (5 min)
You were given `precall-upload.jks`, `precall-upload.jks.base64` and the keystore password.
Save **all three** in a password manager (e.g. as a secure note with attachments) and in one second place.
Never commit them to GitHub.

## 2. Create the GitHub repository and get the code into it (10–20 min)
1. On github.com, tap **+ → New repository**. Name: `precall`. Visibility: **Public**
   (required for the free privacy-policy page; the signing key is never in the repo).
   Leave "Add a README" **unticked** so the repo is empty.
2. Get the code in. Pick one:
   - **Easiest: let Claude push it.** In a Claude chat, connect GitHub and attach the empty `precall` repo, then say
     "push the PreCall code". No computer is needed.
   - **On a computer without a terminal:** install **GitHub Desktop**, unzip `precall-source.zip` (it already
     contains the git history), then **File → Add local repository →** pick the folder **→ Publish repository**
     (untick "Keep this code private").
   - Uploading files through the GitHub website does **not** work reliably for this project (too many files and hidden folders).

> A red ❌ on the very first build is normal: the secrets and privacy page aren't set up yet. Steps 3–4 fix it.

## 3. Add the signing secrets and support email (5 min)
Repo → **Settings → Secrets and variables → Actions**.

**Secrets** tab → *New repository secret*:

| Name | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the entire contents of `precall-upload.jks.base64` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `precall-upload` |

**Variables** tab → *New repository variable*: `SUPPORT_EMAIL` = the email you want users to contact.
It appears in the privacy policy and must match the contact email on the Play listing.

## 4. Turn on the privacy-policy website and re-run the builds (5 min)
1. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Actions → Publish privacy policy → Run workflow**. Your policy is now at
   `https://<you>.github.io/precall/privacy.html`. Open it to check your email shows.
3. **Actions → Build & test → Run workflow** (about 10 minutes).

## 5. Download the app (2 min)
Open the green **Build & test** run → **Artifacts** → download `precall-android-NNNN`.
Inside: `app-release.aab` (for Play) and `app-release.apk` (install it on your own phone to try it now).

## 6. Create a Google Play developer account (20 min + 1–3 days verification)
play.google.com/console → personal account → pay the one-time US$25 → verify your identity.
New personal accounts must also verify a **real Android phone** with the Play Console app, and a phone number.

## 7. Create the app and fill in everything Google asks for (60–75 min)
Google won't send a release for review until all of this is done. Everything is pre-written in `store/`.
1. **Create app**: name `PreCall: Mic & Camera Test`, English (US), **App**, **Free**.
2. **Store listing** (Grow users → Store presence → Main store listing): copy from `store/listing.md`;
   upload `store/graphics/icon-512.png`, `store/graphics/feature-graphic-1024x500.png` and the 8 images in `store/screenshots/phone/`.
3. **App content** (Policy → App content): privacy policy URL, Data safety, content rating, target audience, ads and app access,
   using `store/data-safety.md` and `store/play-console-answers.md`.

## 8. Start the closed test (20 min)
1. **Test and release → Testing → Closed testing →** open the default track.
2. **Countries/regions:** add the countries you want (at least your own).
3. **Testers:** add a list of at least 12 testers' Google-account emails, or a Google Group (aim for 15).
4. **Create release:** upload `app-release.aab`, accept **Play App Signing**, release name `1.0.0`,
   notes from `store/release-notes/1.0.0.txt` → **Save → Send for review**.
5. After approval (usually 1–3 days), copy the **opt-in link** and send it to your testers.

## 9. Wait 14 days with 12+ testers (Google rule for new personal accounts)
At least **12** testers must stay opted in for **14 consecutive days**. Ask them to actually run a test or two.

## 10. Apply for production (15 min + ~7 days review)
Dashboard → **Apply for production** → answer the short questionnaire about your test.
After approval: **Production → Create release** → promote the same build (staged rollout 20% → 100% is wise).

---

## Shipping updates later (all in the browser)
1. On GitHub, open `package.json` → ✏️ edit → change `"version"` (e.g. `"1.0.1"`) → **Commit**.
   Optionally add a line to `CHANGELOG.md` and a file in `store/release-notes/` the same way.
2. **Releases → Draft a new release → Choose a tag:** type `v1.0.1` → **Create new tag → Publish release**.
3. CI builds a signed AAB and attaches it to that release. Download it and upload it in Play Console
   (or let the automatic upload below do it).
   You can also just ask Claude to make the change and cut the release for you.

### Optional: automatic uploads to Play
Play Console → **Setup → API access** → create a service account with "Release manager" permission, download its
JSON key, and save it as the repo secret `PLAY_SERVICE_ACCOUNT_JSON`. After the first manual upload,
**Actions → Build & test → Run workflow** with "Upload to Google Play" ticked will upload to the track you choose
(as a **draft** by default; pick "completed" once the app has passed its first review).

### Notes
- `versionCode` = 1000 + run number × 10 + attempt, so it always increases. Don’t rename `.github/workflows/android.yml`
  (that resets the run counter). If you ever need to, raise the `1000` offset in the workflow.
- If you lose the upload key, Play support can reset it (Play App Signing keeps the real app key safe).
