// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import Auth0 from "@auth/core/providers/auth0";
import Facebook from "@auth/core/providers/facebook";
import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { emailOtp } from "./auth/emailOtp";

// Social / enterprise OAuth providers. Each one needs its credentials in the
// Keys tab (env vars), and its "callback URL" configured in the provider's
// developer dashboard as <CONVEX_SITE_URL>/api/auth/callback/<provider-id>:
//   GitHub:   AUTH_GITHUB_ID, AUTH_GITHUB_SECRET
//   Google:   AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
//   Facebook: AUTH_FACEBOOK_ID, AUTH_FACEBOOK_SECRET
//   Auth0:    AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_ISSUER
const github = GitHub({
  clientId: process.env.AUTH_GITHUB_ID,
  clientSecret: process.env.AUTH_GITHUB_SECRET,
});
const google = Google({
  clientId: process.env.AUTH_GOOGLE_ID,
  clientSecret: process.env.AUTH_GOOGLE_SECRET,
});
const facebook = Facebook({
  clientId: process.env.AUTH_FACEBOOK_ID,
  clientSecret: process.env.AUTH_FACEBOOK_SECRET,
});
const auth0 = Auth0({
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  issuer: process.env.AUTH0_ISSUER,
});


export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, github, google, facebook, auth0, Anonymous],
});
