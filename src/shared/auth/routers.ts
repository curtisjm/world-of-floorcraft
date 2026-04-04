import { router } from "./trpc";
import { danceRouter } from "@syllabus/routers/dance";
import { figureRouter } from "@syllabus/routers/figure";
import { routineRouter } from "@routines/routers/routine";
import { followRouter } from "@social/routers/follow";
import { profileRouter } from "@social/routers/profile";
import { postRouter } from "@social/routers/post";
import { feedRouter } from "@social/routers/feed";
import { commentRouter } from "@social/routers/comment";
import { likeRouter } from "@social/routers/like";
import { saveRouter } from "@social/routers/save";
import { orgRouter } from "@orgs/routers/org";
import { membershipRouter } from "@orgs/routers/membership";
import { inviteRouter } from "@orgs/routers/invite";
import { joinRequestRouter } from "@orgs/routers/join-request";
import { orgPostRouter } from "@orgs/routers/org-post";
import { notificationRouter } from "@social/routers/notification";
import { ablyAuthRouter } from "@messaging/routers/ably-auth";
import { conversationRouter } from "@messaging/routers/conversation";
import { messageRouter } from "@messaging/routers/message";
import { competitionRouter } from "@competitions/routers/competition";
import { scheduleRouter } from "@competitions/routers/schedule";
import { eventRouter } from "@competitions/routers/event";
import { staffRouter } from "@competitions/routers/staff";
import { judgeRouter } from "@competitions/routers/judge";

export const appRouter = router({
  dance: danceRouter,
  figure: figureRouter,
  routine: routineRouter,
  follow: followRouter,
  profile: profileRouter,
  post: postRouter,
  feed: feedRouter,
  comment: commentRouter,
  like: likeRouter,
  save: saveRouter,
  org: orgRouter,
  membership: membershipRouter,
  invite: inviteRouter,
  joinRequest: joinRequestRouter,
  orgPost: orgPostRouter,
  notification: notificationRouter,
  ablyAuth: ablyAuthRouter,
  conversation: conversationRouter,
  message: messageRouter,
  competition: competitionRouter,
  schedule: scheduleRouter,
  event: eventRouter,
  staff: staffRouter,
  judge: judgeRouter,
});

export type AppRouter = typeof appRouter;
