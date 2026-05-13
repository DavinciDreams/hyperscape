import React, { useEffect } from "react";
import { privyAuthManager } from "./PrivyAuthManager";

type PrivyAuthProviderProps = {
  children: React.ReactNode;
};

/**
 * Compatibility wrapper for the old Privy provider.
 *
 * External wallet authentication has been removed from the app. The provider
 * now only marks auth initialization complete so existing app boot gates can
 * continue while the product moves toward a non-custodial Stripe/credits flow.
 */
export function PrivyAuthProvider({ children }: PrivyAuthProviderProps) {
  useEffect(() => {
    privyAuthManager.setPrivySdkReady(true);
  }, []);

  return <>{children}</>;
}
