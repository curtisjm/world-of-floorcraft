"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
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
import { JoinRequestList } from "@orgs/components/join-request-list";
import { InviteManager } from "@orgs/components/invite-manager";

function TransferOwnership({ orgId, orgSlug }: { orgId: number; orgSlug: string }) {
  const [selectedAdmin, setSelectedAdmin] = useState<string>("");
  const utils = trpc.useUtils();
  const router = useRouter();

  const { data: members } = trpc.membership.listMembers.useQuery({ orgId });
  const admins = members?.filter((m) => m.role === "admin") ?? [];

  const transferMutation = trpc.membership.transferOwnership.useMutation({
    onSuccess: () => {
      utils.org.getBySlug.invalidate({ slug: orgSlug });
      utils.membership.getMyMembership.invalidate({ orgId });
      router.push(`/orgs/${orgSlug}`);
    },
  });

  const handleTransfer = () => {
    if (!selectedAdmin) return;
    if (!confirm("Are you sure you want to transfer ownership? This cannot be undone.")) return;
    transferMutation.mutate({ orgId, newOwnerId: selectedAdmin });
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
      <Select value={selectedAdmin} onValueChange={setSelectedAdmin}>
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
      <Button
        variant="destructive"
        onClick={handleTransfer}
        disabled={!selectedAdmin || transferMutation.isPending}
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

  const { data: org, isLoading: orgLoading } = trpc.org.getBySlug.useQuery({ slug });
  const { data: membershipData } = trpc.membership.getMyMembership.useQuery(
    { orgId: org?.id ?? 0 },
    { enabled: !!org }
  );

  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [membershipModel, setMembershipModel] = useState<"open" | "request" | "invite">("open");

  useEffect(() => {
    if (org) {
      setName(org.name);
      setDescription(org.description ?? "");
      setMembershipModel(org.membershipModel);
    }
  }, [org]);

  const updateMutation = trpc.org.update.useMutation({
    onSuccess: () => {
      utils.org.getBySlug.invalidate({ slug });
    },
  });

  const deleteMutation = trpc.org.delete.useMutation({
    onSuccess: () => {
      router.push("/orgs");
    },
  });

  if (orgLoading) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!org) {
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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      orgId: org.id,
      name,
      description: description || undefined,
      membershipModel,
    });
  };

  const handleDelete = () => {
    if (!confirm(`Are you sure you want to delete "${org.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate({ orgId: org.id });
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

          {updateMutation.error && (
            <p className="text-sm text-destructive">{updateMutation.error.message}</p>
          )}

          <Button type="submit" disabled={updateMutation.isPending} className="w-fit">
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </section>

      {/* Join Requests */}
      {membershipModel === "request" && (
        <>
          <Separator className="my-6" />
          <section>
            <h2 className="text-lg font-semibold mb-4">Join Requests</h2>
            <JoinRequestList orgId={org.id} />
          </section>
        </>
      )}

      {/* Invites */}
      {membershipModel === "invite" && (
        <>
          <Separator className="my-6" />
          <section>
            <h2 className="text-lg font-semibold mb-4">Invite Links</h2>
            <InviteManager orgId={org.id} />
          </section>
        </>
      )}

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
                <TransferOwnership orgId={org.id} orgSlug={slug} />
              </div>

              <div>
                <h3 className="font-medium mb-2">Delete Organization</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Permanently delete this organization and all its data.
                </p>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete Organization"}
                </Button>
                {deleteMutation.error && (
                  <p className="text-sm text-destructive mt-2">{deleteMutation.error.message}</p>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
