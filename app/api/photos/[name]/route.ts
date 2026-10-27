import { currentUser, unauthorized } from "@/lib/auth";
import { getPhoto } from "@/lib/db";
import { isPhotoName } from "@/lib/photos";

export async function GET(_request: Request, ctx: RouteContext<"/api/photos/[name]">) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { name } = await ctx.params;
  const photo = isPhotoName(name) ? await getPhoto(user.id, name) : undefined;
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.content_type,
      // Photo names are random and never reused.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
