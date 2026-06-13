# Directed Syllabus Figure Graph

The syllabus treats each dance as a directed graph: figures are nodes, and transitions are first-class directed records with source figure, target figure, syllabus level, and optional condition. This normalizes source `precede` and `follow` data into one transition contract shared by browsing, graph views, and routine construction.
