import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

describe('testing library', () => {
  it('renders a component', () => {
    render(<Text>Hello</Text>);
    expect(screen.getByText('Hello')).toBeTruthy();
  });
});
