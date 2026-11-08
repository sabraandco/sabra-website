# Free guide signup: setup

The guide page is `/builder-grade-guide.html`. It uses its own connection, `/api/guide`, so your
regular newsletter signup and welcome email are not touched.

## 1. Create three segments in Resend (3 minutes)

Resend → **Segments → Create Segment**, then copy each Segment ID:

| Segment name | What it counts |
|---|---|
| `Builder Guide Requests` | Everyone who asks for the guide, including existing subscribers |
| `Builder Guide New Subscribers` | People who joined your newsletter through the guide |
| `Builder Guide Downloads` | People who opened the download link |

## 2. Add three settings in Vercel (3 minutes)

Vercel → your project → **Settings → Environment Variables**. Add to Production and Preview:

| Name | Value |
|---|---|
| `RESEND_GUIDE_SEGMENT_ID` | ID of Builder Guide Requests |
| `RESEND_GUIDE_NEW_SEGMENT_ID` | ID of Builder Guide New Subscribers |
| `RESEND_GUIDE_DOWNLOAD_SEGMENT_ID` | ID of Builder Guide Downloads |

Then redeploy. If one is missing, the guide still sends and only that count is skipped.

## 3. Test it

1. Open the page on your phone and request the guide with an email that is new to your list.
2. Confirm you get the guide email, not the regular welcome email.
3. Confirm the contact is in Newsletter, Builder Guide Requests and Builder Guide New Subscribers.
4. Open the download link and confirm the contact appears in Builder Guide Downloads.
5. Request it again with an address already on your list and confirm the guide still arrives.
6. Sign up through the regular footer form with a new address and confirm the usual welcome email arrives.

Download counts can run slightly high because some email security tools open links automatically.
