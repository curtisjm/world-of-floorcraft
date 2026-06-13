# Convex Reactive Realtime

Messaging and competition live screens update from persisted Convex state through reactive queries instead of an Ably-style event bus. Typing and presence use short-lived heartbeat records, trading purpose-built realtime service semantics for a simpler persisted-state model with subscription cost discipline.
