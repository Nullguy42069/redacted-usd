"use client";
import { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Stack,
  Alert,
} from "@mui/material";
import { ContentCopy, Delete } from "@mui/icons-material";
import { PublicKey } from "@solana/web3.js";
import {
  loadAddressBook,
  addEntry,
  removeEntry,
  type AddressBookEntry,
} from "@/lib/address-book-store";

export default function AddressBookPage() {
  const [entries, setEntries] = useState<AddressBookEntry[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load on mount
  useEffect(() => {
    setEntries(loadAddressBook());
  }, []);

  const openDialog = () => {
    setName("");
    setAddress("");
    setError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setError(null);
  };

  const isValidAddress = (addr: string) => {
    try {
      new PublicKey(addr);
      return true;
    } catch {
      return false;
    }
  };

  const handleSave = () => {
    if (!name.trim() || !address.trim()) {
      setError("Name and address are required");
      return;
    }
    if (!isValidAddress(address.trim())) {
      setError("Invalid Solana address");
      return;
    }

    setSaving(true);
    try {
      const updated = addEntry({
        name: name.trim(),
        address: address.trim(),
      });
      setEntries(updated);
      closeDialog();
    } catch (e) {
      setError("Failed to save entry");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (addr: string) => {
    if (!confirm("Remove this address book entry?")) return;
    const updated = removeEntry(addr);
    setEntries(updated);
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
        <Typography variant="h2">Address book</Typography>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" onClick={openDialog}>
          New entry
        </Button>
      </Box>

      <Card>
        <CardContent>
          {entries.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 6 }}>
              <Typography sx={{ color: "text.secondary", mb: 2 }}>
                No entries yet
              </Typography>
              <Button variant="outlined" onClick={openDialog}>
                New entry
              </Button>
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Address</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.address}>
                    <TableCell sx={{ fontWeight: 500 }}>{entry.name}</TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography sx={{ fontFamily: "monospace", fontSize: 13 }}>
                          {entry.address.slice(0, 4)}…{entry.address.slice(-4)}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => copyAddress(entry.address)}
                          title="Copy address"
                        >
                          <ContentCopy fontSize="inherit" />
                        </IconButton>
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDelete(entry.address)}
                        title="Delete entry"
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Entry Dialog */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>New address book entry</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField
              label="Name / Label"
              placeholder="e.g. Treasury Ops, Alice, Exchange Hot Wallet"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="Solana Address"
              placeholder="Enter base58 address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              fullWidth
              sx={{ fontFamily: "monospace" }}
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !name.trim() || !address.trim()}
          >
            {saving ? "Saving..." : "Save entry"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
