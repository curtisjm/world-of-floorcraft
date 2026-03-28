"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";

export default function CreateOrgPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [membershipModel, setMembershipModel] = useState<"open" | "request" | "invite">("open");

  const createMutation = trpc.org.create.useMutation({
    onSuccess: (org) => {
      router.push(`/orgs/${org.slug}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ name, description: description || undefined, membershipModel });
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Create Organization</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Organization name"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your organization..."
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

        {createMutation.error && (
          <p className="text-sm text-destructive">{createMutation.error.message}</p>
        )}

        <Button type="submit" disabled={createMutation.isPending || !name.trim()}>
          {createMutation.isPending ? "Creating..." : "Create Organization"}
        </Button>
      </form>
    </div>
  );
}
