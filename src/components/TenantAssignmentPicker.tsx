import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

type Account = { id: string; email: string | null; full_name: string | null };

export function TenantAssignmentPicker({ accounts, value, onChange, number }: { accounts: Account[]; value: string; onChange: (value: string) => void; number: string }) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find(account => account.id === value);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button variant="outline" role="combobox" aria-expanded={open} aria-label={`Choose business for ${number}`} className="w-60 justify-between gap-2">
        <span className="truncate">{selected?.email || selected?.full_name || 'Choose business…'}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0">
      <Command>
        <CommandInput placeholder="Search email or name…" aria-label="Search tenant email or name" />
        <CommandList>
          <CommandEmpty>No matching businesses.</CommandEmpty>
          {accounts.map(account => <CommandItem key={account.id} value={account.id} keywords={[account.email ?? '', account.full_name ?? '']} onSelect={() => { onChange(account.id); setOpen(false); }}>
            <div className="min-w-0 flex-1"><div className="break-all">{account.email || account.full_name || 'Unnamed business'}</div>{account.email && account.full_name && <div className="text-xs text-muted-foreground break-words">{account.full_name}</div>}</div>
            {value === account.id && <Check className="size-4 shrink-0" />}
          </CommandItem>)}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}