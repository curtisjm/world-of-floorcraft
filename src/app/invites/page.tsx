"use client";

import { MyInvites } from "@orgs/components/my-invites";

export default function InvitesPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Your Invites</h1>
      <MyInvites />
    </div>
  );
}
