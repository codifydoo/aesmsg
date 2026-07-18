# Security Policy

aesmsg is a privacy-first, zero-knowledge encryption layer. Security reports are taken
seriously and are welcome. This document explains how to report a vulnerability and what to
expect.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use one of these private channels instead:

1. **GitHub private vulnerability reporting (preferred).** On this repository, go to the
   **Security** tab → **Report a vulnerability**. This opens a private advisory visible only
   to the maintainers.
2. **Email.** Write to **info@codify.hr** with `SECURITY` in the subject line. If you want to
   encrypt your report, ask us for a current public key first.

Please include, as far as you can:

- A description of the issue and the impact you believe it has.
- The component affected (`@aesmsg/crypto`, `apps/api`, `apps/worker`, `apps/mobile`, or
  `apps/web`) and the version, commit, or app build.
- Steps to reproduce, a proof of concept, or a test case.
- Any suggested remediation.

## What to expect

We are a small team and do not operate a paid bug-bounty program. We aim to:

- **Acknowledge** your report within **5 business days**.
- Give you an initial **assessment** (accepted / needs-more-info / not-a-vulnerability) and a
  rough timeline once we have reproduced it.
- Keep you updated as we work on a fix, and **credit you** in the advisory and release notes
  if you would like (let us know how you wish to be named).

We follow **coordinated disclosure**: please give us reasonable time to release a fix before
disclosing publicly. We will agree a disclosure date with you.

## Safe harbor

We will not pursue or support legal action against researchers who, in good faith:

- make a genuine effort to avoid privacy violations, data destruction, and service
  degradation while researching;
- only interact with accounts/data they own or have explicit permission to test;
- do not exfiltrate more data than necessary to demonstrate the issue; and
- give us a reasonable chance to remediate before public disclosure.

Testing must stay within your own devices and data. Do not attempt to access, decrypt, or
purge other users' links or ciphertext.

## Scope

**In scope**

- The cryptography and key handling in `packages/crypto` and `apps/mobile`.
- The message API and store in `apps/api`, `apps/worker`, and `packages/server-store`
  (e.g. metadata leakage, access control, abuse/rate-limit bypass, purge/expiry correctness).
- The static web surface in `apps/web` (the marketing landing and the `/l/[id]` deep-link
  bouncer — note it holds no crypto, keys, or ciphertext by design).

**Out of scope**

- The design mockups under `all_design_screens/` (reference material, not shipped code — the
  `sk_live_…` string in a mockup is illustrative sample text, not a real key).
- Vulnerabilities in third-party dependencies — please report those to the upstream project
  (we still want to know if we are shipping an affected version).
- Findings that are **known, documented properties of the design** rather than defects.
  Please read [`docs/security-model.md`](docs/security-model.md) first: it describes the
  threat model and honest boundaries, including that aesmsg has **no forward secrecy** for a
  recipient's long-lived identity key, that a compromised device or private-key backup breaks
  confidentiality, and that MitM defense relies on manual fingerprint / QR verification.

## Supported versions

aesmsg is pre-1.0 and ships from `main`. Only the **latest released version** of each app and
the current `main` are supported for security fixes. There are no backported patches for older
builds.
