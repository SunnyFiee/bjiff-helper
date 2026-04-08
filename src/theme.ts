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
      default: "#F4EFE7",
      paper: "#FFFCF8"
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
    divider: alpha("#734E3C", 0.1)
  },
  shape: {
    borderRadius: 16
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
            "linear-gradient(180deg, #F6F0E8 0%, #F1E9DE 100%)"
        },
        "#root": {
          minHeight: "100vh"
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha("#FFFCF8", 0.9),
          backdropFilter: "blur(14px)",
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
          backgroundColor: alpha("#FFFFFF", 0.9),
          border: `1px solid ${alpha("#734E3C", 0.12)}`,
          boxShadow: "0 10px 26px rgba(73, 48, 33, 0.05)"
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none"
        },
        rounded: {
          borderRadius: 16
        }
      }
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 16
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          minHeight: 40,
          paddingInline: 16
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 600
        }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 16
        }
      }
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: alpha("#FBF6F0", 0.98),
          backgroundImage: "none"
        }
      }
    }
  }
});
