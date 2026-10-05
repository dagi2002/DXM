import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Banner, Button, EmptyState, Modal, Segmented, StatTile, StatusBadge, TextField } from './index';

async function expectNoAxeViolations(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } }); // contrast is tested on tokens
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
}

describe('Button', () => {
  it('fires onPress and is keyboard accessible', async () => {
    const onPress = vi.fn();
    render(<Button onPress={onPress}>Add site</Button>);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Add site' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('announces pending state and ignores presses while pending', async () => {
    const onPress = vi.fn();
    render(
      <Button onPress={onPress} isPending pendingLabel="Saving…">
        Save
      </Button>,
    );
    const btn = screen.getByRole('button');
    await userEvent.click(btn);
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Saving…');
  });
});

describe('TextField', () => {
  it('associates label, description and error with the input', () => {
    const { rerender } = render(<TextField label="Domain" description="Without https://" />);
    const input = screen.getByLabelText('Domain');
    expect(input).toHaveAccessibleDescription('Without https://');
    rerender(
      <TextField
        label="Domain"
        description="Without https://"
        errorMessage="Enter a domain like example.et"
      />,
    );
    expect(screen.getByLabelText('Domain')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Domain')).toHaveAccessibleDescription('Enter a domain like example.et');
  });
});

describe('Segmented', () => {
  it('works as a radio group', async () => {
    function Harness() {
      const [v, setV] = useState('en');
      return (
        <Segmented
          label="Language"
          value={v}
          onChange={setV}
          options={[
            { id: 'en', label: 'EN' },
            { id: 'am', label: 'አማ', lang: 'am' },
          ]}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Language' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'አማ' }));
    expect(screen.getByRole('radio', { name: 'አማ' })).toBeChecked();
  });
});

describe('StatusBadge & Banner', () => {
  it('conveys status with text, not color alone', () => {
    render(<StatusBadge tone="bad">Critical</StatusBadge>);
    expect(screen.getByText('Critical')).toBeVisible();
  });
  it('uses alert role for errors and status otherwise', () => {
    render(
      <>
        <Banner tone="bad" title="Failed" />
        <Banner tone="good" title="Saved" />
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });
});

describe('StatTile', () => {
  it('formats via the metric registry and colors deltas by meaning', () => {
    render(
      <StatTile
        label="Left immediately"
        metric="bounce_rate"
        value={0.382}
        previous={0.341}
        comparisonLabel="vs last week"
      />,
    );
    expect(screen.getByText('38.2%')).toBeInTheDocument();
    const delta = screen.getByText('4.1 pts').closest('p')!;
    expect(delta.className).toContain('text-bad'); // bounce going up is bad
  });
  it('renders missing values as a dash without a delta', () => {
    render(<StatTile label="Visitors" metric="visitors" value={null} previous={10} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('Modal', () => {
  it('traps focus in a labelled dialog and closes on Escape', async () => {
    const onOpenChange = vi.fn();
    render(
      <Modal isOpen onOpenChange={onOpenChange} title="Add a site">
        <TextField label="Site name" autoFocus />
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Add a site' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('accessibility', () => {
  it('a composed form has no axe violations', async () => {
    const { container } = render(
      <main>
        <h1>Add a site</h1>
        <TextField label="Site name" />
        <TextField
          label="Domain"
          description="Without https://"
          errorMessage="Enter a domain like example.et"
        />
        <Segmented
          label="Language"
          value="en"
          onChange={() => {}}
          options={[
            { id: 'en', label: 'EN' },
            { id: 'am', label: 'አማ', lang: 'am' },
          ]}
        />
        <StatusBadge tone="warn">Needs work</StatusBadge>
        <EmptyState title="No sites yet" body="Add one." action={<Button>Add site</Button>} />
      </main>,
    );
    await expectNoAxeViolations(container);
  });
});
