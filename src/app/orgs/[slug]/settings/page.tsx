"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import { Separator } from "@shared/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { convexErrorMessage } from "@social/lib/convex-error";
import { JoinRequestList } from "@orgs/components/join-request-list";
import { InviteManager } from "@orgs/components/invite-manager";
import { SendInvite } from "@orgs/components/send-invite";
import { AdminManager } from "@orgs/components/admin-manager";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

function TransferOwnership({
  orgId,
  orgSlug,
}: {
  orgId: Id<"organizations">;
  orgSlug: string;
}) {
  const [selectedAdmin, setSelectedAdmin] = useState<Id<"users"> | "">("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const members = useQuery(api.orgs.listMembers, { orgId });
  const admins = members?.filter((m) => m.role === "admin" && !m.isOwner) ?? [];

  const transfer = useMutation(api.orgs.transferOwnership);

  const handleTransfer = async () => {
    if (!selectedAdmin) return;
    if (!confirm("Are you sure you want to transfer ownership? This cannot be undone.")) return;
    setSubmitting(true);
    setError(null);
    try {
      await transfer({ orgId, newOwnerId: selectedAdmin });
      router.push(`/orgs/${orgSlug}`);
    } catch (err) {
      setError(convexErrorMessage(err, "Failed to transfer ownership"));
      setSubmitting(false);
    }
  };

  if (admins.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No admins available. Promote a member to admin first.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Select
        value={selectedAdmin || undefined}
        onValueChange={(v) => setSelectedAdmin(v as Id<"users">)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select admin to transfer to" />
        </SelectTrigger>
        <SelectContent>
          {admins.map((admin) => (
            <SelectItem key={admin.userId} value={admin.userId}>
              {admin.displayName ?? admin.username ?? admin.userId}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        variant="destructive"
        onClick={handleTransfer}
        disabled={!selectedAdmin || submitting}
        className="w-fit"
      >
        Transfer Ownership
      </Button>
    </div>
  );
}

export default function OrgSettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const org = useQuery(api.orgs.getBySlug, { slug });
  const membershipData = useQuery(
    api.orgs.getMyMembership,
    org ? { orgId: org._id } : "skip",
  );

  const update = useMutation(api.orgs.update);
  const remove = useMutation(api.orgs.remove);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [membershipModel, setMembershipModel] = useState<"open" | "request" | "invite">("open");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (org) {
      setName(org.name);
      setDescription(org.description ?? "");
      setMembershipModel(org.membershipModel);
    }
  }, [org]);

  if (org === undefined) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (org === null) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <p className="text-muted-foreground">Organization not found.</p>
      </div>
    );
  }

  const isOwner = membershipData?.isOwner ?? false;
  const memberRole = membershipData?.membership?.role;
  const isAdmin = isOwner || memberRole === "admin";

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <p className="text-muted-foreground">Access denied. Admin or owner required.</p>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await update({
        orgId: org._id,
        name,
        description: description || null,
        membershipModel,
      });
    } catch (err) {
      setSaveError(convexErrorMessage(err, "Failed to save changes"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${org.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await remove({ orgId: org._id });
      router.push("/orgs");
    } catch (err) {
      setDeleteError(convexErrorMessage(err, "Failed to delete organization"));
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Organization Settings</h1>

      {/* General */}
      <section>
        <h2 className="text-lg font-semibold mb-4">General</h2>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="membershipModel">Membership</Label>
            <Select
              value={membershipModel}
              onValueChange={(v) => setMembershipModel(v as "open" | "request" | "invite")}
            >
              <SelectTrigger id="membershipModel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open — anyone can join</SelectItem>
                <SelectItem value="request">Request — members must be approved</SelectItem>
                <SelectItem value="invite">Invite — by invitation only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {saveError && <p className="text-sm text-destructive">{saveError}</p>}

          <Button type="submit" disabled={saving} className="w-fit">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </section>

      {/* Join Requests */}
      {membershipModel === "request" && (
        <>
          <Separator className="my-6" />
          <section>
            <h2 className="text-lg font-semibold mb-4">Join Requests</h2>
            <JoinRequestList orgId={org._id} />
          </section>
        </>
      )}

      {/* Invites */}
      {membershipModel === "invite" && (
        <>
          <Separator className="my-6" />
          <section>
            <h2 className="text-lg font-semibold mb-4">Invite Members</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Search for users to send a direct invite.
            </p>
            <SendInvite orgId={org._id} />
          </section>

          <Separator className="my-6" />
          <section>
            <h2 className="text-lg font-semibold mb-4">Invite Link</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Generate a shareable link that anyone can use to join.
            </p>
            <InviteManager orgId={org._id} />
          </section>
        </>
      )}

      {/* Manage Admins */}
      <Separator className="my-6" />
      <section>
        <h2 className="text-lg font-semibold mb-4">Manage Admins</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Promote members to admin or revoke admin privileges.
        </p>
        <AdminManager orgId={org._id} />
      </section>

      {/* Danger Zone (owner only) */}
      {isOwner && (
        <>
          <Separator className="my-6" />
          <section>
            <h2 className="text-lg font-semibold text-destructive mb-4">Danger Zone</h2>

            <div className="flex flex-col gap-6">
              <div>
                <h3 className="font-medium mb-2">Transfer Ownership</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Transfer ownership to another admin member.
                </p>
                <TransferOwnership orgId={org._id} orgSlug={slug} />
              </div>

              <div>
                <h3 className="font-medium mb-2">Delete Organization</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Permanently delete this organization and all its data.
                </p>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Delete Organization"}
                </Button>
                {deleteError && (
                  <p className="text-sm text-destructive mt-2">{deleteError}</p>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
