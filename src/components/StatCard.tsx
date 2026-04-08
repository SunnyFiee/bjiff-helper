import { Card, CardContent, Stack, Typography } from "@mui/material";

interface StatCardProps {
  label: string;
  value: string;
  hint: string;
}

export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Stack spacing={1}>
          <Typography color="text.secondary" variant="body2">
            {label}
          </Typography>
          <Typography variant="h4">{value}</Typography>
          <Typography color="text.secondary" variant="body2">
            {hint}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
