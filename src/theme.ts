import { alpha, createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#B33A3A",
      dark: "#8E2E2E",
      light: "#D86B58",
      contrastText: "#FFF8F3"
    },
    secondary: {
      main: "#C5922E",
      dark: "#946A1C",
      light: "#E1BA66",
      contrastText: "#2C1E08"
    },
    background: {
      default: "#F4EFE8",
      paper: "#FFFDF9"
    },
    text: {
      primary: "#1F1A17",
      secondary: "#5F554F"
    },
    success: {
      main: "#3D8C6F"
    },
    error: {
      main: "#C35454"
    },
    divider: alpha("#734E3C", 0.12)
  },
  shape: {
    borderRadius: 20
  },
  typography: {
    fontFamily:
      '"Avenir Next", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif',
    h1: {
      fontWeight: 700,
      letterSpacing: "-0.04em"
    },
    h2: {
      fontWeight: 700,
      letterSpacing: "-0.03em"
    },
    h3: {
      fontWeight: 700,
      letterSpacing: "-0.02em"
    },
    button: {
      fontWeight: 600,
      textTransform: "none"
    },
    overline: {
      fontWeight: 700,
      letterSpacing: "0.18em"
    }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          minHeight: "100%"
        },
        body: {
          minHeight: "100%",
          background:
            "radial-gradient(circle at top left, rgba(179, 58, 58, 0.12), transparent 24rem), linear-gradient(180deg, #F6F1E9 0%, #EFE7DB 48%, #F9F5EF 100%)"
        },
        "#root": {
          minHeight: "100vh"
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha("#FFFDF9", 0.78),
          backdropFilter: "blur(18px)",
          boxShadow: "none"
        }
      }
    },
    MuiCard: {
      defaultProps: {
        elevation: 0
      },
      styleOverrides: {
        root: {
          border: `1px solid ${alpha("#734E3C", 0.12)}`,
          boxShadow: "0 22px 42px rgba(73, 48, 33, 0.08)"
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        rounded: {
          borderRadius: 20
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          paddingInline: 16
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999
        }
      }
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: alpha("#FFF7F1", 0.96),
          backgroundImage:
            "radial-gradient(circle at top left, rgba(216, 107, 88, 0.16), transparent 18rem)"
        }
      }
    }
  }
});
