"use client";

import { type Editor, useEditorState } from "@tiptap/react";
import { Button } from "@shared/ui/button";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link,
  Minus,
  Image,
  Table,
  Rows3,
  Columns3,
  Trash2,
  TableCellsMerge,
  TableCellsSplit,
  PanelTopDashed,
  PanelLeftDashed,
} from "lucide-react";

interface ToolbarProps {
  editor: Editor | null;
}

export function Toolbar({ editor }: ToolbarProps) {
  const editorState = useEditorState({
    editor,
    selector: (ctx) => ({
      isInTable: ctx.editor?.isActive("table") ?? false,
    }),
  });

  if (!editor) return null;

  const isInTable = editorState?.isInTable ?? false;

  const tools = [
    {
      icon: Bold,
      action: () => editor.chain().focus().toggleBold().run(),
      active: editor.isActive("bold"),
      label: "Bold",
    },
    {
      icon: Italic,
      action: () => editor.chain().focus().toggleItalic().run(),
      active: editor.isActive("italic"),
      label: "Italic",
    },
    {
      icon: Strikethrough,
      action: () => editor.chain().focus().toggleStrike().run(),
      active: editor.isActive("strike"),
      label: "Strikethrough",
    },
    { divider: true as const },
    {
      icon: Heading1,
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      active: editor.isActive("heading", { level: 1 }),
      label: "Heading 1",
    },
    {
      icon: Heading2,
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      active: editor.isActive("heading", { level: 2 }),
      label: "Heading 2",
    },
    {
      icon: Heading3,
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      active: editor.isActive("heading", { level: 3 }),
      label: "Heading 3",
    },
    { divider: true as const },
    {
      icon: List,
      action: () => editor.chain().focus().toggleBulletList().run(),
      active: editor.isActive("bulletList"),
      label: "Bullet List",
    },
    {
      icon: ListOrdered,
      action: () => editor.chain().focus().toggleOrderedList().run(),
      active: editor.isActive("orderedList"),
      label: "Ordered List",
    },
    {
      icon: Quote,
      action: () => editor.chain().focus().toggleBlockquote().run(),
      active: editor.isActive("blockquote"),
      label: "Blockquote",
    },
    {
      icon: Code,
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      active: editor.isActive("codeBlock"),
      label: "Code Block",
    },
    {
      icon: Minus,
      action: () => editor.chain().focus().setHorizontalRule().run(),
      active: false,
      label: "Horizontal Rule",
    },
    {
      icon: Link,
      action: () => {
        const url = window.prompt("Enter URL:");
        if (url) {
          editor.chain().focus().setLink({ href: url }).run();
        }
      },
      active: editor.isActive("link"),
      label: "Link",
    },
    {
      icon: Image,
      action: () => {
        const url = window.prompt("Enter image URL:");
        if (url) {
          editor.chain().focus().setImage({ src: url }).run();
        }
      },
      active: false,
      label: "Image",
    },
    { divider: true as const },
    {
      icon: Table,
      action: () => {
        if (!isInTable) {
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: false })
            .run();
        }
      },
      active: isInTable,
      label: isInTable ? "Table options" : "Insert Table",
    },
  ];

  return (
    <div className="border-b border-border">
      <div className="flex flex-wrap gap-1 p-2">
        {tools.map((tool, i) => {
          if ("divider" in tool) {
            return (
              <div key={i} className="w-px h-6 bg-border mx-1 self-center" />
            );
          }
          const Icon = tool.icon;
          return (
            <Button
              key={tool.label}
              type="button"
              variant="ghost"
              size="sm"
              className={`h-8 w-8 p-0 ${tool.active ? "bg-muted" : ""}`}
              onClick={tool.action}
              title={tool.label}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}
      </div>

      {isInTable && (
        <div className="flex flex-wrap gap-1 px-2 pb-2 border-t border-border pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => editor.chain().focus().toggleHeaderRow().run()}
            title="Toggle header row"
          >
            <PanelTopDashed className="h-3.5 w-3.5" /> Header row
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
            title="Toggle header column"
          >
            <PanelLeftDashed className="h-3.5 w-3.5" /> Header column
          </Button>
          <div className="w-px h-5 bg-border mx-1 self-center" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            title="Add column after"
          >
            <Columns3 className="h-3.5 w-3.5" /> Add column
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => editor.chain().focus().addRowAfter().run()}
            title="Add row after"
          >
            <Rows3 className="h-3.5 w-3.5" /> Add row
          </Button>
          <div className="w-px h-5 bg-border mx-1 self-center" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => editor.chain().focus().mergeCells().run()}
            title="Merge selected cells"
          >
            <TableCellsMerge className="h-3.5 w-3.5" /> Merge
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => editor.chain().focus().splitCell().run()}
            title="Split cell"
          >
            <TableCellsSplit className="h-3.5 w-3.5" /> Split
          </Button>
          <div className="w-px h-5 bg-border mx-1 self-center" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5 text-destructive-foreground hover:text-destructive-foreground"
            onClick={() => editor.chain().focus().deleteColumn().run()}
            title="Delete column"
          >
            <Columns3 className="h-3.5 w-3.5" /> Del column
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5 text-destructive-foreground hover:text-destructive-foreground"
            onClick={() => editor.chain().focus().deleteRow().run()}
            title="Delete row"
          >
            <Rows3 className="h-3.5 w-3.5" /> Del row
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5 text-destructive-foreground hover:text-destructive-foreground"
            onClick={() => editor.chain().focus().deleteTable().run()}
            title="Delete table"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete table
          </Button>
        </div>
      )}
    </div>
  );
}
