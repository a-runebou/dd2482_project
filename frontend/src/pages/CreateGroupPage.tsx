import { CreateGroupForm } from "../features/groups/CreateGroupForm";

export function CreateGroupPage() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-bold">Create a group</h1>
      <CreateGroupForm />
    </main>
  );
}
