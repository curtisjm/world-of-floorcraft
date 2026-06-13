# Dense Routine Entry Ordering

A routine's sequence is stored as separate ordered entries, each pointing at one figure, with dense positions. Inserts, removals, and reorders rewrite affected positions, trading extra writes for simple reads, rendering, and entry-level metadata.
