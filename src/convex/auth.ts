// Free, accountless auth: only the anonymous (guest) provider.
// No email OTP token flow and no credit-based email service — sign-in is
// instant and costs nothing.

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";


export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous],
});
