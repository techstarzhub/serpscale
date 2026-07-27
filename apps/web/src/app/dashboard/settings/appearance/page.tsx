import { ThemeCustomizer } from "@/components/theme/theme-customizer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AppearancePage() {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-heading text-lg font-semibold">Appearance</h3>
        <p className="text-sm text-muted-foreground">
          Customize the dashboard - colors, fonts, and shape. Changes apply live.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>
            Every value here is a live design token. Nothing in the UI is hardcoded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeCustomizer />
        </CardContent>
      </Card>
    </div>
  );
}
