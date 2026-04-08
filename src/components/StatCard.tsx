import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

interface StatCardProps {
  label: string;
  value: string;
  hint: string;
}

export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <Card
      sx={{
        height: "100%"
      }}
    >
      <Box
        sx={{
          backgroundColor: alpha("#B33A3A", 0.08),
          height: 5,
          width: "100%"
        }}
      />
      <CardContent sx={{ p: 2.5 }}>
        <Stack spacing={1.5}>
          <Typography
            color="primary"
            sx={{
              fontSize: 12,
              letterSpacing: "0.16em"
            }}
            variant="overline"
          >
            {label}
          </Typography>
          <Typography sx={{ lineHeight: 1.05 }} variant="h3">
            {value}
          </Typography>
          <Typography color="text.secondary" variant="body2">
            {hint}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
