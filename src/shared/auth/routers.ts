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
import { registrationRouter } from "@competitions/routers/registration";
import { entryRouter } from "@competitions/routers/entry";
import { paymentRouter } from "@competitions/routers/payment";
import { numberRouter } from "@competitions/routers/number";
import { tbaRouter } from "@competitions/routers/tba";
import { teamMatchRouter } from "@competitions/routers/team-match";
import { addDropRouter } from "@competitions/routers/add-drop";
import { roundRouter } from "@competitions/routers/round";
import { scheduleEstimationRouter } from "@competitions/routers/schedule-estimation";
import { statsRouter } from "@competitions/routers/stats";
import { awardsRouter } from "@competitions/routers/awards";
import { scoringRouter } from "@competitions/routers/scoring";
import { judgeSessionRouter } from "@competitions/routers/judge-session";
import { scrutineerRouter } from "@competitions/routers/scrutineer";
import { registrationTableRouter } from "@competitions/routers/registration-table";
import { deckCaptainRouter } from "@competitions/routers/deck-captain";
import { emceeRouter } from "@competitions/routers/emcee";
import { scrutineerDashboardRouter } from "@competitions/routers/scrutineer-dashboard";
import { liveViewRouter } from "@competitions/routers/live-view";

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
  registration: registrationRouter,
  entry: entryRouter,
  payment: paymentRouter,
  number: numberRouter,
  tba: tbaRouter,
  teamMatch: teamMatchRouter,
  addDrop: addDropRouter,
  round: roundRouter,
  scheduleEstimation: scheduleEstimationRouter,
  stats: statsRouter,
  awards: awardsRouter,
  scoring: scoringRouter,
  judgeSession: judgeSessionRouter,
  scrutineer: scrutineerRouter,
  registrationTable: registrationTableRouter,
  deckCaptain: deckCaptainRouter,
  emcee: emceeRouter,
  scrutineerDashboard: scrutineerDashboardRouter,
  liveView: liveViewRouter,
});

export type AppRouter = typeof appRouter;
