import { publicProcedure, router } from "../../shared/auth/trpc";
import { db } from "../../shared/db";
import { dances } from "../schema";

export const danceRouter = router({
  list: publicProcedure.query(async () => {
    return db.select().from(dances);
  }),
});
