import { ProfileSettings } from "@social/components/profile-settings";

export default function ProfileSettingsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Edit Profile</h1>
      <ProfileSettings />
    </div>
  );
}
