import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

export default async function FigureDetailPage({
  params,
}: {
  params: Promise<{ dance: string; id: string }>;
}) {
  const { dance, id } = await params;
  const displayName = dance
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline" className="border-bronze text-bronze">
                Student Teacher
              </Badge>
              <span className="text-sm text-muted-foreground">
                {displayName} — Figure #{id}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Natural Turn
            </h1>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <a href={`/dances/${dance}/figures/${id}/graph`}>
                Local Graph
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/dances/${dance}`}>Back to {displayName}</a>
            </Button>
          </div>
        </div>

        <Separator />

        <Tabs defaultValue="man">
          <TabsList>
            <TabsTrigger value="man">Man&apos;s Steps</TabsTrigger>
            <TabsTrigger value="lady">Lady&apos;s Steps</TabsTrigger>
          </TabsList>

          <TabsContent value="man" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Man&apos;s Steps</CardTitle>
                <CardDescription>
                  Footwork, alignment, and turn details
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-muted-foreground text-sm space-y-4">
                  <p>Step data will be loaded from the database.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="font-medium text-foreground">
                        Footwork:
                      </span>{" "}
                      —
                    </div>
                    <div>
                      <span className="font-medium text-foreground">
                        CBM:
                      </span>{" "}
                      —
                    </div>
                    <div>
                      <span className="font-medium text-foreground">
                        Sway:
                      </span>{" "}
                      —
                    </div>
                    <div>
                      <span className="font-medium text-foreground">
                        Timing:
                      </span>{" "}
                      —
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lady" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Lady&apos;s Steps</CardTitle>
                <CardDescription>
                  Footwork, alignment, and turn details
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Step data will be loaded from the database.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Preceded By</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Figures that can precede this one will be listed here.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Followed By</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Figures that can follow this one will be listed here.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
