import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

test('renders home screen', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /noted/i })).toBeInTheDocument();
});

test('routes quick actions to app views', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  expect(await screen.findByRole('heading', { name: /^search$/i })).toBeInTheDocument();
  expect(await screen.findByText(/search could not load/i)).toBeInTheDocument();
});
